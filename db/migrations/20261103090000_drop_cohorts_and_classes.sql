-- No cohorts, no class timetable, no registers.
--
-- Students enrol straight into a course and start when they are ready
-- (20261101090100_course_enrolments.sql), so the class-group machinery the
-- first schema planned is dropped: cohorts, their generated sessions, the
-- attendance register and its absence follow-ups. Production held none of
-- it when this ran.
--
-- Cohorts were also how an instructor's access was scoped (they saw the
-- students of the cohorts they taught). With them gone, students,
-- enrolments, message preferences and course progress are admin business,
-- like fees. An instructor account, if one is ever made, sees courses and
-- nothing else until a new way of assigning students is built.

-- ── access: admin-only where it went through cohorts ──────────────────
-- the *_admin_write policies (for all) already let an admin read these

drop policy students_select on public.students;
drop policy prefs_select on public.notification_prefs;
drop policy enrolments_select on public.enrolments;
drop policy progress_select on public.module_progress;
drop policy progress_insert on public.module_progress;
drop policy progress_update on public.module_progress;
create policy progress_admin on public.module_progress for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- ── approving: no cohort to choose ─────────────────────────────────────

drop function public.approve_application(uuid, date, bigint, date, uuid);

create function public.approve_application(
  p_application uuid,
  p_starts_on date default null,
  p_fee_kobo bigint default null,
  p_due_on date default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_app public.applications;
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
  v_fee := coalesce(p_fee_kobo, v_course.default_fee_kobo, 0);

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

  insert into public.enrolments (student_id, course_slug, starts_on, status)
  values (v_student, v_app.course_slug, v_starts,
          case when v_fee > 0 then 'awaiting_payment' else 'active' end::public.enrolment_status)
  returning id into v_enrolment;

  if v_fee > 0 then
    insert into public.invoices (enrolment_id, description, amount_kobo, due_on)
    values (
      v_enrolment,
      'Tuition — ' || v_course.title,
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

revoke all on function public.approve_application(uuid, date, bigint, date) from public, anon;
grant execute on function public.approve_application(uuid, date, bigint, date) to authenticated;

-- ── classes and registers ──────────────────────────────────────────────

drop function public.generate_sessions(uuid);
drop table public.attendance;
drop function private.attendance_before();
drop function private.attendance_after();
drop table public.sessions;
drop type public.attendance_status;

-- ── cohorts ────────────────────────────────────────────────────────────

-- the trigger that took an enrolment's course from its cohort
drop trigger enrolment_before on public.enrolments;
drop function private.enrolment_before();
alter table public.enrolments drop column cohort_id;
drop table public.cohorts;
drop type public.training_mode;

drop function private.teaches_student(uuid);
drop function private.teaches_enrolment(uuid);
drop function private.teaches_session(uuid);
drop function private.teaches(uuid);
