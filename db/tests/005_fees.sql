-- Fees as the console manages them: adding, changing and voiding invoices,
-- asserted as the admin, an instructor and the worker.
begin;
create schema tap;
create extension pgtap with schema tap;
grant usage on schema tap to anon, authenticated, worker;
set local search_path = public, tap;
grant anon, authenticated, worker to current_user with inherit false, set true;
select plan(16);

insert into neon_auth."user" (id, name, email, "emailVerified") values
  ('c0000000-0000-0000-0000-000000000001', 'Head', 'head@tests.invalid', true),
  ('c0000000-0000-0000-0000-000000000002', 'Ife', 'ife@tests.invalid', true);
insert into public.staff (id, full_name, email, role) values
  ('c0000000-0000-0000-0000-000000000001', 'Head', 'head@tests.invalid', 'admin'),
  ('c0000000-0000-0000-0000-000000000002', 'Ife', 'ife@tests.invalid', 'instructor');
insert into public.courses (slug, title) values ('fees-course', 'Fees Course');
insert into public.students (id, full_name, email) values
  ('c0000000-0000-0000-0000-0000000000a1', 'Ada Obi', 'ada@tests.invalid');
insert into public.enrolments (id, student_id, course_slug, status) values
  ('c0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-0000000000a1', 'fees-course', 'awaiting_payment'),
  ('c0000000-0000-0000-0000-0000000000e2', 'c0000000-0000-0000-0000-0000000000a1', 'fees-course', 'completed');

-- ── as the admin ───────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "c0000000-0000-0000-0000-000000000001"}', true);

select lives_ok($$
  insert into public.invoices (id, enrolment_id, description, amount_kobo, due_on) values
    ('c0000000-0000-0000-0000-0000000000f1', 'c0000000-0000-0000-0000-0000000000e1', 'Tuition', 10000000, current_date + 7),
    ('c0000000-0000-0000-0000-0000000000f2', 'c0000000-0000-0000-0000-0000000000e1', 'Second instalment', 5000000, current_date + 30)
$$, 'the admin adds invoices to an enrolment');

insert into public.payments (invoice_id, amount_kobo, method, reference, recorded_by)
values ('c0000000-0000-0000-0000-0000000000f1', 4000000, 'transfer', 'FEES-1', 'c0000000-0000-0000-0000-000000000001');

select throws_ok($$ update public.invoices set status = 'void' where id = 'c0000000-0000-0000-0000-0000000000f1' $$,
  '23514', 'An invoice with payments can''t be voided', 'an invoice with payments cannot be voided');

select throws_ok($$ update public.invoices set amount_kobo = 3000000 where id = 'c0000000-0000-0000-0000-0000000000f1' $$,
  '23514', 'The amount can''t be less than the NGN 40,000 already paid', 'nor cut below what was paid');

select lives_ok($$ update public.invoices set amount_kobo = 4000000 where id = 'c0000000-0000-0000-0000-0000000000f1' $$,
  'lowering it to what was paid is allowed');
select is((select status::text from public.invoices where id = 'c0000000-0000-0000-0000-0000000000f1'),
  'paid', 'and settles it');

update public.invoices set amount_kobo = 6000000 where id = 'c0000000-0000-0000-0000-0000000000f1';
select is((select status::text from public.invoices where id = 'c0000000-0000-0000-0000-0000000000f1'),
  'open', 'raising the amount of a paid invoice reopens it');

update public.invoices set status = 'paid' where id = 'c0000000-0000-0000-0000-0000000000f2';
select is((select status::text from public.invoices where id = 'c0000000-0000-0000-0000-0000000000f2'),
  'open', 'an unpaid invoice cannot simply be marked paid');

select lives_ok($$ update public.invoices set due_on = current_date + 60, description = 'Second instalment (moved)'
  where id = 'c0000000-0000-0000-0000-0000000000f2' $$, 'the due date and description can change');

select lives_ok($$ update public.invoices set status = 'void' where id = 'c0000000-0000-0000-0000-0000000000f2' $$,
  'an invoice with no payments can be voided');
select throws_ok($$ update public.invoices set status = 'open' where id = 'c0000000-0000-0000-0000-0000000000f2' $$,
  '23514', null, 'a voided invoice stays voided');
select throws_ok($$
  insert into public.payments (invoice_id, amount_kobo, method, reference, recorded_by)
  values ('c0000000-0000-0000-0000-0000000000f2', 1000, 'cash', 'FEES-2', 'c0000000-0000-0000-0000-000000000001')
$$, '23514', null, 'and takes no payments');

select throws_ok($$ update public.invoices set enrolment_id = 'c0000000-0000-0000-0000-0000000000e2'
  where id = 'c0000000-0000-0000-0000-0000000000f1' $$,
  '22023', null, 'an invoice stays with its enrolment');

select throws_ok($$
  insert into public.invoices (enrolment_id, description, amount_kobo, due_on)
  values ('c0000000-0000-0000-0000-0000000000e1', 'Nothing', 0, current_date)
$$, '23514', null, 'an invoice must be for something');

-- ── as an instructor ───────────────────────────────────────────────────

select set_config('request.jwt.claims', '{"sub": "c0000000-0000-0000-0000-000000000002"}', true);

select is((select count(*)::int from public.invoices), 0, 'an instructor sees no invoices');
select throws_ok($$
  insert into public.invoices (enrolment_id, description, amount_kobo, due_on)
  values ('c0000000-0000-0000-0000-0000000000e1', 'Sneaky', 100, current_date)
$$, '42501', null, 'nor adds one');

update public.invoices set amount_kobo = 100 where id = 'c0000000-0000-0000-0000-0000000000f1';
reset role;
select is((select amount_kobo from public.invoices where id = 'c0000000-0000-0000-0000-0000000000f1'),
  6000000::bigint, 'nor changes one');

select * from finish();
rollback;
