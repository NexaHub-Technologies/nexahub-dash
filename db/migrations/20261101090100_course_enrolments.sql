-- Enrol straight into a course, and become active on paying.
--
-- Most courses start whenever the student is ready rather than with an
-- intake, so an enrolment now belongs to a course; a cohort (a class group
-- with dates) is optional. Approving an application enrols the applicant
-- in the course they applied for and invoices the fee. The enrolment waits
-- for payment, and the first payment of any size makes it active. An admin
-- can set any status from the student registry; every change is in the
-- audit log, which is where a student's status history comes from.
--
--   stateDiagram-v2
--     [*] --> awaiting_payment: approved, fee > 0
--     [*] --> active: approved, no fee
--     awaiting_payment --> active: first payment (trigger)
--     active --> paused: admin
--     paused --> active: admin
--     active --> completed: admin
--     awaiting_payment --> withdrawn: admin
--     active --> withdrawn: admin
--     paused --> withdrawn: admin
--
--   sequenceDiagram
--     actor Admin
--     participant fn as approve_application()
--     participant db as students, enrolments, invoices
--     participant pay as payments
--     participant trg as payment_after (AFTER INSERT)
--     Admin->>fn: application, start date, fee
--     fn->>db: student (reused by email), enrolment awaiting_payment, invoice
--     Admin->>pay: record a transfer or cash payment
--     pay->>trg: fires
--     trg->>db: invoice paid if the balance is 0; enrolment awaiting_payment -> active
--     trg->>db: queue the payment receipt

-- ── enrolments belong to a course ───────────────────────────────────────

alter table public.enrolments add column course_slug text references public.courses (slug);
update public.enrolments e set course_slug = c.course_slug
  from public.cohorts c where c.id = e.cohort_id;
alter table public.enrolments
  alter column course_slug set not null,
  alter column cohort_id drop not null,
  alter column status set default 'awaiting_payment',
  add column starts_on date;

-- one open enrolment per student per course; finished ones can be repeated
create unique index enrolments_one_open_per_course on public.enrolments (student_id, course_slug)
  where status in ('awaiting_payment', 'active', 'paused');

-- an enrolment in a cohort takes the cohort's course when none is named,
-- and may not name a different one
create function private.enrolment_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_course text;
begin
  if new.cohort_id is not null then
    select course_slug into v_course from public.cohorts where id = new.cohort_id;
    new.course_slug := coalesce(new.course_slug, v_course);
    if v_course is distinct from new.course_slug then
      raise exception 'That cohort is for a different course' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger enrolment_before before insert or update on public.enrolments
  for each row execute function private.enrolment_before();

-- ── student details ─────────────────────────────────────────────────────

alter table public.students
  add column address text check (char_length(address) <= 300),
  add column date_of_birth date check (date_of_birth between '1900-01-01' and current_date);

create trigger audit after insert or update or delete on public.students
  for each row execute function private.audit();

-- ── approving ───────────────────────────────────────────────────────────

drop function public.approve_application(uuid, uuid, date);

create function public.approve_application(
  p_application uuid,
  p_starts_on date default null,
  p_fee_kobo bigint default null,
  p_due_on date default null,
  p_cohort uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_app public.applications;
  v_cohort public.cohorts;
  v_course public.courses;
  v_fee bigint;
  v_starts date := coalesce(p_starts_on, (now() at time zone 'Africa/Lagos')::date);
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
  if p_fee_kobo is not null and p_fee_kobo < 0 then
    raise exception 'The fee can''t be negative' using errcode = '22023';
  end if;

  select * into v_course from public.courses where slug = v_app.course_slug;
  if p_cohort is not null then
    select * into v_cohort from public.cohorts where id = p_cohort;
    if not found then
      raise exception 'No such cohort' using errcode = '22023';
    end if;
    v_starts := coalesce(p_starts_on, v_cohort.starts_on);
  end if;
  v_fee := coalesce(p_fee_kobo, v_cohort.fee_kobo, v_course.default_fee_kobo, 0);

  select id into v_student from public.students where lower(email) = lower(v_app.email);
  if v_student is null then
    insert into public.students (full_name, email, phone, gender, employment, application_id)
    values (v_app.full_name, v_app.email, v_app.phone, v_app.gender, v_app.employment, v_app.id)
    returning id into v_student;
  end if;

  insert into public.notification_prefs (student_id, email, sms)
  values (v_student, v_app.notify_consent, v_app.notify_consent)
  on conflict (student_id) do nothing;

  if exists (
    select 1 from public.enrolments
    where student_id = v_student and course_slug = v_app.course_slug
      and status in ('awaiting_payment', 'active', 'paused')
  ) then
    raise exception '% is already enrolled on this course', v_app.full_name using errcode = '23514';
  end if;

  insert into public.enrolments (student_id, course_slug, cohort_id, starts_on, status)
  values (v_student, v_app.course_slug, p_cohort, v_starts,
          case when v_fee > 0 then 'awaiting_payment' else 'active' end::public.enrolment_status)
  returning id into v_enrolment;

  if v_fee > 0 then
    insert into public.invoices (enrolment_id, description, amount_kobo, due_on)
    values (
      v_enrolment,
      'Tuition — ' || coalesce(v_cohort.name, v_course.title),
      v_fee,
      coalesce(p_due_on, greatest(v_starts, (now() at time zone 'Africa/Lagos')::date))
    );
  end if;

  update public.applications
  set status = 'approved', reviewed_by = private.uid(), reviewed_at = now()
  where id = p_application;

  perform private.enqueue(
    'welcome',
    jsonb_build_object('course', v_course.title, 'starts_on', v_starts, 'fee_kobo', v_fee),
    'welcome:' || v_enrolment,
    p_student => v_student
  );

  insert into public.audit_log (action, table_name, row_id, detail)
  values ('approve', 'applications', p_application::text,
          jsonb_build_object('enrolment', v_enrolment, 'student', v_student, 'fee_kobo', v_fee));

  return v_enrolment;
end;
$$;

revoke all on function public.approve_application(uuid, date, bigint, date, uuid) from public, anon;
grant execute on function public.approve_application(uuid, date, bigint, date, uuid) to authenticated;

-- ── paying activates ────────────────────────────────────────────────────

create or replace function private.payment_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_balance bigint;
  v_student uuid;
  v_enrolment uuid;
begin
  select balance_kobo into v_balance from public.invoice_balances where invoice_id = new.invoice_id;
  if v_balance <= 0 then
    update public.invoices set status = 'paid' where id = new.invoice_id and status = 'open';
  end if;

  select e.student_id, e.id into v_student, v_enrolment
  from public.invoices i join public.enrolments e on e.id = i.enrolment_id
  where i.id = new.invoice_id;

  -- the first payment of any size starts the course; paused, completed and
  -- withdrawn enrolments are left as they are
  update public.enrolments set status = 'active'
  where id = v_enrolment and status = 'awaiting_payment';

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

-- ── status history ──────────────────────────────────────────────────────

-- Each time one of a student's enrolments was created or changed status:
-- when, by whom, from what to what. Read from the audit log, which admins
-- alone may see.
create function public.enrolment_history(p_student uuid)
returns table (
  enrolment_id uuid,
  course_slug text,
  at timestamptz,
  from_status text,
  to_status text,
  actor_name text
)
language sql stable security definer set search_path = '' as $$
  select
    e.id,
    e.course_slug,
    l.at,
    case when l.action = 'update' then l.detail -> 'before' ->> 'status' end,
    case when l.action = 'update' then l.detail -> 'after' ->> 'status' else l.detail ->> 'status' end,
    s.full_name
  from public.enrolments e
  join public.audit_log l on l.table_name = 'enrolments' and l.row_id = e.id::text
  left join public.staff s on s.id = l.actor
  where private.is_admin()
    and e.student_id = p_student
    and (l.action = 'insert'
         or (l.action = 'update'
             and l.detail -> 'before' ->> 'status' is distinct from l.detail -> 'after' ->> 'status'))
  order by l.at, l.id;
$$;

revoke all on function public.enrolment_history(uuid) from public, anon;
grant execute on function public.enrolment_history(uuid) to authenticated;

revoke all on function private.enrolment_before() from public, anon, authenticated, worker;
