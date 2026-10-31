-- Access rules and workflows, asserted as the roles that will really make the
-- calls. Fixtures are written as the owner; every assertion after them runs
-- as anon or as a signed-in member of staff, because the owner bypasses RLS
-- and would prove nothing.
begin;
-- pgTAP lives in its own schema for the length of the run; the roles under
-- test need to reach its functions
create schema tap;
create extension pgtap with schema tap;
grant usage on schema tap to anon, authenticated, worker;
set local search_path = public, tap;
-- on Neon the owner isn't a superuser, so it may only impersonate roles it is
-- a member of; the grant is rolled back with everything else
grant anon, authenticated, worker to current_user with inherit false, set true;
select plan(37);

-- ── fixtures (as owner) ────────────────────────────────────────────────

insert into neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values
  ('a0000000-0000-0000-0000-000000000001', 'Admin', 'head@tests.invalid', true, now(), now()),
  ('a0000000-0000-0000-0000-000000000002', 'Ife', 'ife@tests.invalid', true, now(), now()),
  ('a0000000-0000-0000-0000-000000000003', 'Tunde', 'tunde@tests.invalid', true, now(), now());
insert into public.staff (id, full_name, email, role) values
  ('a0000000-0000-0000-0000-000000000001', 'Admin', 'head@tests.invalid', 'admin'),
  ('a0000000-0000-0000-0000-000000000002', 'Ife', 'ife@tests.invalid', 'instructor'),
  ('a0000000-0000-0000-0000-000000000003', 'Tunde', 'tunde@tests.invalid', 'instructor');

insert into public.courses (slug, title, default_fee_kobo) values ('web-dev', 'Web Development', 15000000);
insert into public.courses (slug, title, default_fee_kobo) values ('free-intro', 'Free Intro', 0);
insert into public.course_modules values ('web-dev', 1, 'HTML'), ('web-dev', 2, 'CSS');

-- ── schema-wide ─────────────────────────────────────────────────────────

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0, 'every table in public has row-level security on');

select is(
  (select count(*)::int from pg_tables t
   where t.schemaname = 'public'
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename)),
  0, 'every table in public has at least one policy');

-- ── the website, as anon ────────────────────────────────────────────────

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select lives_ok($$
  insert into public.applications
    (course_slug, full_name, email, phone, gender, employment, mode,
     has_experience, has_laptop, heard_from, can_commit, notify_consent)
  values ('web-dev', 'Ada Obi', 'Ada@Example.com', '+2348030000001', 'Female', 'Student',
          'Online training', false, true, 'Social media', true, true),
         ('free-intro', 'Bayo Ade', 'bayo@example.com', '+2348030000002', 'Male', 'Employed',
          'Online training', true, true, 'Friend or referral', true, true)
$$, 'the website can submit applications');

select throws_ok($$ select count(*) from public.applications $$,
  '42501', null, 'the website cannot read applications back');

select throws_ok($$
  insert into public.applications
    (course_slug, full_name, email, phone, gender, employment, mode,
     has_experience, has_laptop, heard_from, can_commit, notify_consent, status)
  values ('web-dev', 'Eve', 'eve@example.com', '+2348030000009', 'Female', 'Student',
          'Online training', false, true, 'Other', true, true, 'approved')
$$, '42501', null, 'the website cannot submit an application as already approved');

select throws_ok($$
  insert into public.applications
    (course_slug, full_name, email, phone, gender, employment, mode,
     has_experience, has_laptop, heard_from, can_commit, notify_consent)
  values ('web-dev', 'Eve', 'not-an-email', '+2348030000009', 'Female', 'Student',
          'Online training', false, true, 'Other', true, true)
$$, '23514', null, 'a malformed email is rejected by the database, not just the form');

select throws_ok($$ select public.approve_application(gen_random_uuid()) $$,
  '42501', null, 'the website cannot call approve_application');

reset role;
select set_config('test.ada', (select id::text from public.applications where full_name = 'Ada Obi'), true);
select set_config('test.bayo', (select id::text from public.applications where full_name = 'Bayo Ade'), true);

-- ── approving, as staff ─────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);

select throws_ok(
  format($$ select public.approve_application(%L) $$,
         current_setting('test.ada')),
  '42501', null, 'an instructor cannot approve applications');

select is((select count(*)::int from public.applications), 0,
  'an instructor sees no applications');

select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);

select set_config('test.enrolment',
  public.approve_application(current_setting('test.ada')::uuid)::text, true);

select isnt(current_setting('test.enrolment'), '', 'an admin approves an application');

select is(
  (select amount_kobo from public.invoices where enrolment_id = current_setting('test.enrolment')::uuid),
  15000000::bigint, 'approval raises an invoice for the course fee');

select is(
  (select count(*)::int from public.notifications where template = 'welcome'),
  2, 'approval queues a welcome by email and by SMS');

select is(
  (select reviewed_by from public.applications where id = current_setting('test.ada')::uuid),
  'a0000000-0000-0000-0000-000000000001'::uuid, 'the approval records who approved it');

select throws_ok(
  format($$ select public.approve_application(%L) $$,
         current_setting('test.ada')),
  '22023', null, 'an application cannot be approved twice');

select lives_ok(
  format($$ select public.approve_application(%L) $$, current_setting('test.bayo')),
  'a second student joins a free course');

select is(
  (select count(*)::int from public.invoices i join public.enrolments e on e.id = i.enrolment_id
   where e.course_slug = 'free-intro'),
  0, 'a free course raises no invoice');

-- ── instructors: no students to see ────────────────────────────────────
-- their access went through the cohorts they taught, which are gone

select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);

select is((select count(*)::int from public.students), 0, 'an instructor sees no students');
select is((select count(*)::int from public.enrolments), 0, 'nor enrolments');
select is((select count(*)::int from public.invoices), 0, 'nor fees');
select is((select count(*)::int from public.courses), 2, 'but does see the courses');
select throws_ok(
  format($$ insert into public.module_progress (enrolment_id, module_n, status) values (%L, 1, 'done') $$,
         current_setting('test.enrolment')),
  '42501', null, 'and cannot record a student''s progress');

reset role;
select is(
  (select count(*)::int from information_schema.tables
   where table_schema = 'public' and table_name in ('cohorts', 'sessions', 'attendance')),
  0, 'there are no cohorts, classes or registers');

-- ── payments, as admin ──────────────────────────────────────────────────

select set_config('test.invoice', (select id::text from public.invoices
  where enrolment_id = current_setting('test.enrolment')::uuid), true);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);

insert into public.payments (invoice_id, amount_kobo, method, reference, recorded_by)
values (current_setting('test.invoice')::uuid, 5000000, 'transfer', 'GTB-001',
        'a0000000-0000-0000-0000-000000000001');

select is((select status::text from public.invoices where id = current_setting('test.invoice')::uuid),
  'open', 'a part payment leaves the invoice open');

insert into public.payments (invoice_id, amount_kobo, method, reference, recorded_by)
values (current_setting('test.invoice')::uuid, 10000000, 'cash', 'RCPT-002',
        'a0000000-0000-0000-0000-000000000001');

select is((select status::text from public.invoices where id = current_setting('test.invoice')::uuid),
  'paid', 'paying the balance settles the invoice');

select throws_ok(
  format($$ insert into public.payments (invoice_id, amount_kobo, method, reference, recorded_by)
            values (%L, 100, 'cash', 'GTB-001', 'a0000000-0000-0000-0000-000000000001') $$,
         current_setting('test.invoice')),
  '23505', null, 'the same payment reference cannot be recorded twice');

select throws_ok(
  format($$ insert into public.payments (invoice_id, amount_kobo, method, reference, recorded_by)
            values (%L, 100, 'paystack', 'PSK-1', 'a0000000-0000-0000-0000-000000000001') $$,
         current_setting('test.invoice')),
  '42501', null, 'staff cannot record a payment as if it came from Paystack');

reset role;
select is(
  (select count(*)::int from public.notifications where template = 'payment_received'),
  4, 'each payment queues one receipt by email and SMS');

-- ── access ends the moment it is removed ────────────────────────────────

-- another admin's doing, as far as the database can tell: nobody signed in
select set_config('request.jwt.claims', '', true);
update public.staff set active = false where id = 'a0000000-0000-0000-0000-000000000001';
insert into public.applications
  (course_slug, full_name, email, phone, gender, employment, mode,
   has_experience, has_laptop, heard_from, can_commit, notify_consent)
values ('web-dev', 'Chi', 'chi@example.com', '+2348030000003', 'Female', 'Student',
        'Online training', false, true, 'Other', true, true);
select set_config('test.chi', (select id::text from public.applications where full_name = 'Chi'), true);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);

select throws_ok(
  format($$ select public.approve_application(%L) $$,
         current_setting('test.chi')),
  '42501', null, 'a deactivated admin loses their access on the next request, token or not');

select throws_ok(
  $$ select private.enqueue('welcome', '{}', 'forged', p_staff => 'a0000000-0000-0000-0000-000000000002') $$,
  '42501', null, 'signed-in users cannot queue messages directly');


-- ── the worker, as the Neon Function ───────────────────────────────────

reset role;
select set_config('test.invoice', (select id::text from public.invoices limit 1), true);
set local role worker;
select set_config('request.jwt.claims', '', true);

select is(private.uid(), null, 'the worker acts as nobody in particular');

select throws_ok($$ select count(*) from public.staff $$,
  '42501', null, 'the worker cannot read staff');
select throws_ok($$ select count(*) from public.students $$,
  '42501', null, 'the worker cannot read students');
select throws_ok($$ select count(*) from public.audit_log $$,
  '42501', null, 'the worker cannot read the audit log');

select lives_ok(
  format($$ insert into public.payments (invoice_id, amount_kobo, method, reference)
            values (%L, 100, 'paystack', 'PSK-TEST-1') $$, current_setting('test.invoice')),
  'the worker records a Paystack payment');

select throws_ok(
  format($$ insert into public.payments (invoice_id, amount_kobo, method, reference)
            values (%L, 100, 'cash', 'FORGED-1') $$, current_setting('test.invoice')),
  '42501', null, 'the worker cannot record a cash or transfer payment');

select throws_ok($$ select public.approve_application(gen_random_uuid()) $$,
  '42501', null, 'the worker cannot approve applications');

select throws_ok(
  $$ select private.enqueue('welcome', '{}', 'forged-by-worker', p_staff => 'a0000000-0000-0000-0000-000000000002') $$,
  '42501', null, 'the worker cannot queue arbitrary messages');

reset role;
select * from finish();
rollback;
