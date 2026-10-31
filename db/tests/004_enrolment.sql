-- From application to active student: approving straight into a course,
-- paying to start, and managing status from the registry. Asserted as the
-- website (anon), the admin and an instructor.
begin;
create schema tap;
create extension pgtap with schema tap;
grant usage on schema tap to anon, authenticated, worker;
set local search_path = public, tap;
grant anon, authenticated, worker to current_user with inherit false, set true;
select plan(22);

insert into neon_auth."user" (id, name, email, "emailVerified") values
  ('f0000000-0000-0000-0000-000000000001', 'Head', 'head@tests.invalid', true),
  ('f0000000-0000-0000-0000-000000000002', 'Ife', 'ife@tests.invalid', true);
insert into public.staff (id, full_name, email, role) values
  ('f0000000-0000-0000-0000-000000000001', 'Head', 'head@tests.invalid', 'admin'),
  ('f0000000-0000-0000-0000-000000000002', 'Ife', 'ife@tests.invalid', 'instructor');
insert into public.courses (slug, title, default_fee_kobo) values
  ('paid-course', 'Paid Course', 10000000),
  ('free-course', 'Free Course', 0);

-- ── the website applies ────────────────────────────────────────────────

set local role anon;
select set_config('request.jwt.claims', '', true);

select lives_ok($$
  insert into public.applications
    (course_slug, full_name, email, phone, gender, employment, mode,
     has_experience, has_laptop, heard_from, can_commit, notify_consent)
  values ('paid-course', 'Ada Obi', 'ada@tests.invalid', '+2348030000001', 'Female', 'Student',
          'Online training', false, true, 'Social media', true, true),
         ('free-course', 'Bayo Ade', 'bayo@tests.invalid', '+2348030000002', 'Male', 'Employed',
          'Online training', true, true, 'Other', true, false),
         ('paid-course', 'Chi Eze', 'chi@tests.invalid', '+2348030000003', 'Female', 'Student',
          'Online training', false, true, 'Other', true, true),
         ('paid-course', 'Ada Obi', 'ADA@tests.invalid', '+2348030000001', 'Female', 'Student',
          'Online training', false, true, 'Other', true, true)
$$, 'the website sends applications');

reset role;
select set_config('test.ada', (select id::text from public.applications where full_name = 'Ada Obi' and email = 'ada@tests.invalid'), true);
select set_config('test.ada2', (select id::text from public.applications where email = 'ADA@tests.invalid'), true);
select set_config('test.bayo', (select id::text from public.applications where full_name = 'Bayo Ade'), true);
select set_config('test.chi', (select id::text from public.applications where full_name = 'Chi Eze'), true);

-- ── approving, as the admin ────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "f0000000-0000-0000-0000-000000000001"}', true);

select set_config('test.e_ada',
  public.approve_application(current_setting('test.ada')::uuid, p_starts_on => '2026-11-09')::text, true);

select is((select status::text from public.enrolments where id = current_setting('test.e_ada')::uuid),
  'awaiting_payment', 'approving into a paid course waits for payment');
select is((select course_slug from public.enrolments where id = current_setting('test.e_ada')::uuid),
  'paid-course', 'the enrolment is for the course applied for, with no cohort needed');
select is((select amount_kobo from public.invoices where enrolment_id = current_setting('test.e_ada')::uuid),
  10000000::bigint, 'and is invoiced at the course fee');
select is((select starts_on from public.enrolments where id = current_setting('test.e_ada')::uuid),
  '2026-11-09'::date, 'with the start date chosen');

select set_config('test.e_bayo',
  public.approve_application(current_setting('test.bayo')::uuid)::text, true);
select is((select status::text from public.enrolments where id = current_setting('test.e_bayo')::uuid),
  'active', 'a free course is active at once');
select is((select count(*)::int from public.invoices where enrolment_id = current_setting('test.e_bayo')::uuid),
  0, 'and raises no invoice');

select set_config('test.e_chi',
  public.approve_application(current_setting('test.chi')::uuid, p_fee_kobo => 7500000)::text, true);
select is((select amount_kobo from public.invoices where enrolment_id = current_setting('test.e_chi')::uuid),
  7500000::bigint, 'the admin can set a different fee when approving');

select throws_ok(format($$ select public.approve_application(%L) $$, current_setting('test.ada2')),
  '23514', null, 'the same person cannot be enrolled twice on a course they are still on');

select throws_ok(format($$ select public.approve_application(%L, p_fee_kobo => -1) $$, current_setting('test.ada2')),
  '22023', null, 'a negative fee is refused');

-- ── paying starts the course ───────────────────────────────────────────

select set_config('test.inv_ada',
  (select id::text from public.invoices where enrolment_id = current_setting('test.e_ada')::uuid), true);

select lives_ok(format($$
  insert into public.payments (invoice_id, amount_kobo, method, reference, recorded_by)
  values (%L, 3000000, 'transfer', 'TRF-ADA-1', 'f0000000-0000-0000-0000-000000000001')
$$, current_setting('test.inv_ada')), 'the admin records a part payment');

select is((select status::text from public.enrolments where id = current_setting('test.e_ada')::uuid),
  'active', 'the first payment makes the student active');
select is((select balance_kobo from public.invoice_balances where invoice_id = current_setting('test.inv_ada')::uuid),
  7000000::bigint, 'and the rest stays outstanding');
select is((select status::text from public.invoices where id = current_setting('test.inv_ada')::uuid),
  'open', 'so the invoice is still open');

-- ── managing status ────────────────────────────────────────────────────

select lives_ok(format($$ update public.enrolments set status = 'paused' where id = %L $$, current_setting('test.e_ada')),
  'the admin pauses a student');
select lives_ok(format($$ update public.enrolments set status = 'withdrawn' where id = %L $$, current_setting('test.e_chi')),
  'and withdraws one who left before paying');

select lives_ok(format($$
  insert into public.payments (invoice_id, amount_kobo, method, reference, recorded_by)
  values ((select id from public.invoices where enrolment_id = %L), 1000, 'cash', 'CASH-CHI-1', 'f0000000-0000-0000-0000-000000000001')
$$, current_setting('test.e_chi')), 'a late payment can still be recorded');
select is((select status::text from public.enrolments where id = current_setting('test.e_chi')::uuid),
  'withdrawn', 'but it does not bring a withdrawn student back');

select results_eq(
  format($$ select to_status from public.enrolment_history(%L) where enrolment_id = %L $$,
         (select student_id from public.enrolments where id = current_setting('test.e_ada')::uuid),
         current_setting('test.e_ada')),
  $$ values ('awaiting_payment'), ('active'), ('paused') $$,
  'the history shows each status the student has had, in order');

select is(
  (select actor_name from public.enrolment_history(
     (select student_id from public.enrolments where id = current_setting('test.e_ada')::uuid))
   where to_status = 'paused'),
  'Head', 'and who changed it');

set local role authenticated;

-- ── as an instructor ───────────────────────────────────────────────────

select set_config('request.jwt.claims', '{"sub": "f0000000-0000-0000-0000-000000000002"}', true);

update public.enrolments set status = 'completed' where id = current_setting('test.e_bayo')::uuid;
reset role;
select is((select status::text from public.enrolments where id = current_setting('test.e_bayo')::uuid),
  'active', 'an instructor cannot change the status of a student they do not teach');
set local role authenticated;

select is((select count(*)::int from public.enrolment_history(
  (select student_id from public.enrolments where id = current_setting('test.e_bayo')::uuid))),
  0, 'nor read anyone''s status history');

reset role;
select * from finish();
rollback;
