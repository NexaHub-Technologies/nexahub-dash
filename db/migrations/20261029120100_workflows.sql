-- NexaHub Dash: workflows — the RPCs staff call, and the triggers that fire on
-- their writes. What fires when:
--
-- ```mermaid
-- sequenceDiagram
--     actor Admin
--     participant rpc as approve_application()
--     participant db as tables
--     participant q as notifications (outbox)
--     Admin->>rpc: approve(application, cohort)
--     rpc->>db: student (found by email, or created)
--     rpc->>db: enrolment, invoice (cohort fee), notification_prefs
--     rpc->>q: welcome (email + sms)
--     rpc->>db: application → approved, audit_log
--
--     actor Paystack
--     Paystack->>db: payments INSERT (webhook, or admin for cash/transfer)
--     db->>db: before: invoice must not be void
--     db->>db: after: balance ≤ 0 → invoice paid
--     db->>q: payment_received
--
--     actor Instructor
--     Instructor->>db: attendance INSERT/UPDATE
--     db->>db: before: enrolment and session in the same cohort; stamp marker
--     db->>q: status absent → absent_followup (student)
--     db->>q: second absence in a row → absent_twice (instructor)
-- ```
--
-- Errors carry explicit SQLSTATEs, so the app maps them without matching text:
--   42501 not allowed (→ 403)   22023 bad argument (→ 400)   23514 rule broken (→ 400)

-- ── the outbox ──────────────────────────────────────────────────────────

-- Queue one message for a student (email, plus SMS when they have a phone)
-- or for a member of staff (email). Contact details are looked up when the
-- message is sent, not now, so a corrected phone number still gets used.
-- Idempotent: the same key twice queues nothing new.
create function private.enqueue(
  p_template text,
  p_data jsonb,
  p_key text,
  p_student uuid default null,
  p_staff uuid default null,
  p_send_after timestamptz default now()
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (student_id, staff_id, channel, template, data, dedupe_key, send_after)
  values (p_student, p_staff, 'email', p_template, p_data, p_key || ':email', p_send_after)
  on conflict (dedupe_key) do nothing;

  if p_student is not null
     and (select phone from public.students where id = p_student) is not null then
    insert into public.notifications (student_id, channel, template, data, dedupe_key, send_after)
    values (p_student, 'sms', p_template, p_data, p_key || ':sms', p_send_after)
    on conflict (dedupe_key) do nothing;
  end if;
end;
$$;

-- ── generic audit trail ─────────────────────────────────────────────────
-- Reads whole rows as jsonb rather than named fields, so one trigger serves
-- tables with different columns.

create function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (action, table_name, row_id, detail)
  values (
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'invoice_id'),
    case when tg_op = 'UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', v_row)
         else v_row end
  );
  return null;
end;
$$;

create trigger audit after insert or update or delete on public.staff
  for each row execute function private.audit();
create trigger audit after insert or update or delete on public.invoices
  for each row execute function private.audit();
create trigger audit after insert or update or delete on public.payments
  for each row execute function private.audit();
create trigger audit after insert or update or delete on public.enrolments
  for each row execute function private.audit();

-- ── applications ────────────────────────────────────────────────────────

-- Turn an application into an enrolled student, in one transaction: the
-- student (matched by email, so a returning student is not duplicated), the
-- enrolment, the first invoice from the cohort's fee, message preferences
-- from the consent they gave, and a welcome message.
create function public.approve_application(
  p_application uuid,
  p_cohort uuid,
  p_due_on date default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_app public.applications;
  v_cohort public.cohorts;
  v_student uuid;
  v_enrolment uuid;
begin
  if not private.is_admin() then
    raise exception 'Only an admin can approve applications' using errcode = '42501';
  end if;

  select * into v_app from public.applications where id = p_application for update;
  if not found then
    raise exception 'No such application' using errcode = '22023';
  end if;
  if v_app.status <> 'new' then
    raise exception 'This application has already been %', v_app.status using errcode = '22023';
  end if;

  select * into v_cohort from public.cohorts where id = p_cohort;
  if not found then
    raise exception 'No such cohort' using errcode = '22023';
  end if;

  select id into v_student from public.students where lower(email) = lower(v_app.email);
  if v_student is null then
    insert into public.students (full_name, email, phone, gender, employment, application_id)
    values (v_app.full_name, v_app.email, v_app.phone, v_app.gender, v_app.employment, v_app.id)
    returning id into v_student;
  end if;

  insert into public.notification_prefs (student_id, email, sms)
  values (v_student, v_app.notify_consent, v_app.notify_consent)
  on conflict (student_id) do nothing;

  insert into public.enrolments (student_id, cohort_id)
  values (v_student, p_cohort)
  returning id into v_enrolment;

  if v_cohort.fee_kobo > 0 then
    insert into public.invoices (enrolment_id, description, amount_kobo, due_on)
    values (
      v_enrolment,
      'Tuition — ' || v_cohort.name,
      v_cohort.fee_kobo,
      coalesce(p_due_on, greatest(v_cohort.starts_on, current_date))
    );
  end if;

  update public.applications
  set status = 'approved', reviewed_by = private.uid(), reviewed_at = now()
  where id = p_application;

  perform private.enqueue(
    'welcome',
    jsonb_build_object('cohort', v_cohort.name, 'starts_on', v_cohort.starts_on),
    'welcome:' || v_enrolment,
    p_student => v_student
  );

  insert into public.audit_log (action, table_name, row_id, detail)
  values ('approve', 'applications', p_application::text,
          jsonb_build_object('cohort', p_cohort, 'enrolment', v_enrolment));

  return v_enrolment;
end;
$$;

create function public.decline_application(p_application uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Only an admin can decline applications' using errcode = '42501';
  end if;
  update public.applications
  set status = 'declined', reviewed_by = private.uid(), reviewed_at = now(), decline_reason = p_reason
  where id = p_application and status = 'new';
  if not found then
    raise exception 'No new application with that id' using errcode = '22023';
  end if;
  insert into public.audit_log (action, table_name, row_id, detail)
  values ('decline', 'applications', p_application::text, jsonb_build_object('reason', p_reason));
end;
$$;

-- ── sessions ────────────────────────────────────────────────────────────

-- Lay out a cohort's classes from its weekly pattern, in Lagos time.
-- Re-running it adds only what is missing, so it is safe after the pattern
-- or dates change. Returns how many sessions it added.
create function public.generate_sessions(p_cohort uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_cohort public.cohorts;
  v_added integer;
begin
  if not (private.is_admin() or private.teaches(p_cohort)) then
    raise exception 'Not your cohort' using errcode = '42501';
  end if;
  select * into v_cohort from public.cohorts where id = p_cohort;
  if v_cohort.meeting_time is null or cardinality(v_cohort.meeting_days) = 0 then
    raise exception 'Set the cohort''s meeting days and time first' using errcode = '22023';
  end if;

  insert into public.sessions (cohort_id, starts_at, ends_at, location)
  select
    v_cohort.id,
    (d + v_cohort.meeting_time) at time zone 'Africa/Lagos',
    (d + v_cohort.meeting_time) at time zone 'Africa/Lagos'
      + make_interval(mins => v_cohort.meeting_minutes),
    v_cohort.location
  from generate_series(v_cohort.starts_on, v_cohort.ends_on, interval '1 day') as g(day)
  cross join lateral (select g.day::date as d) x
  where extract(isodow from d)::smallint = any (v_cohort.meeting_days)
  on conflict (cohort_id, starts_at) do nothing;

  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

-- ── attendance ──────────────────────────────────────────────────────────

create function private.attendance_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Before-triggers run ahead of RLS's WITH CHECK, so without this a member
  -- of staff writing to a cohort they don't teach would get the enrolment
  -- error below — which tells them about a cohort they may not see — rather
  -- than a plain refusal. (private.uid() is null only for the database itself.)
  if private.uid() is not null
     and not (private.is_admin() or private.teaches_session(new.session_id)) then
    raise exception 'Not your cohort' using errcode = '42501';
  end if;
  if (select cohort_id from public.sessions where id = new.session_id)
     is distinct from (select cohort_id from public.enrolments where id = new.enrolment_id) then
    raise exception 'That student is not enrolled in this session''s cohort' using errcode = '23514';
  end if;
  new.marked_by := private.uid();
  new.marked_at := now();
  return new;
end;
$$;

create trigger attendance_before before insert or update on public.attendance
  for each row execute function private.attendance_before();

-- Marking a student absent queues a follow-up to them; a second absence in a
-- row also tells the instructor. Keys make both once-only per session.
create function private.attendance_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.sessions;
  v_student uuid;
  v_cohort public.cohorts;
  v_absent_run integer;
begin
  if new.status <> 'absent'
     or (tg_op = 'UPDATE' and old.status = 'absent') then
    return null;
  end if;

  select * into v_session from public.sessions where id = new.session_id;
  select * into v_cohort from public.cohorts where id = v_session.cohort_id;
  select student_id into v_student from public.enrolments where id = new.enrolment_id;

  perform private.enqueue(
    'absent_followup',
    jsonb_build_object('cohort', v_cohort.name, 'session_at', v_session.starts_at),
    'absent:' || new.session_id || ':' || new.enrolment_id,
    p_student => v_student
  );

  -- this session and the one before it, both marked absent
  select count(*) filter (where a.status = 'absent') into v_absent_run
  from (
    select s.id from public.sessions s
    where s.cohort_id = v_session.cohort_id and not s.cancelled
      and s.starts_at <= v_session.starts_at
    order by s.starts_at desc
    limit 2
  ) recent
  left join public.attendance a
    on a.session_id = recent.id and a.enrolment_id = new.enrolment_id;

  if v_absent_run = 2 and v_cohort.instructor_id is not null then
    perform private.enqueue(
      'absent_twice',
      jsonb_build_object('student_id', v_student, 'cohort', v_cohort.name),
      'absent2:' || new.session_id || ':' || new.enrolment_id,
      p_staff => v_cohort.instructor_id
    );
  end if;
  return null;
end;
$$;

create trigger attendance_after after insert or update on public.attendance
  for each row execute function private.attendance_after();

create function private.progress_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_by := private.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger progress_before before insert or update on public.module_progress
  for each row execute function private.progress_before();

-- ── payments ────────────────────────────────────────────────────────────

create function private.payment_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select status from public.invoices where id = new.invoice_id) = 'void' then
    raise exception 'That invoice has been voided' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger payment_before before insert on public.payments
  for each row execute function private.payment_before();

-- Settle the invoice once it is paid in full, and send a receipt.
create function private.payment_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_balance bigint;
  v_student uuid;
begin
  select balance_kobo into v_balance from public.invoice_balances where invoice_id = new.invoice_id;
  if v_balance <= 0 then
    update public.invoices set status = 'paid' where id = new.invoice_id and status = 'open';
  end if;

  select e.student_id into v_student
  from public.invoices i join public.enrolments e on e.id = i.enrolment_id
  where i.id = new.invoice_id;

  perform private.enqueue(
    'payment_received',
    jsonb_build_object(
      'amount_kobo', new.amount_kobo,
      'balance_kobo', greatest(v_balance, 0),
      'method', new.method,
      'reference', new.reference
    ),
    'payment:' || new.id,
    p_student => v_student
  );
  return null;
end;
$$;

create trigger payment_after after insert on public.payments
  for each row execute function private.payment_after();

-- ── notifications ───────────────────────────────────────────────────────

create function public.retry_notification(p_notification uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Only an admin can retry messages' using errcode = '42501';
  end if;
  update public.notifications
  set status = 'queued', attempts = 0, last_error = null, send_after = now()
  where id = p_notification and status = 'failed';
  if not found then
    raise exception 'Only a failed message can be retried' using errcode = '22023';
  end if;
end;
$$;

-- ── exposure ────────────────────────────────────────────────────────────
-- These four are the operations the dashboard's server calls as the signed-in
-- member of staff; each checks the caller's role itself. Postgres lets PUBLIC
-- execute every new function, so that default is taken back here, and the
-- private helpers stay callable by nobody outside the database.

revoke all on function
  public.approve_application(uuid, uuid, date),
  public.decline_application(uuid, text),
  public.generate_sessions(uuid),
  public.retry_notification(uuid)
  from public, anon;
grant execute on function
  public.approve_application(uuid, uuid, date),
  public.decline_application(uuid, text),
  public.generate_sessions(uuid),
  public.retry_notification(uuid)
  to authenticated;

revoke all on function
  private.enqueue(text, jsonb, text, uuid, uuid, timestamptz),
  private.audit(), private.attendance_before(), private.attendance_after(),
  private.progress_before(), private.payment_before(), private.payment_after()
  from public, anon, authenticated;
