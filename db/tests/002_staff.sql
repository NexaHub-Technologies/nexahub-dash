-- Inviting and managing staff, asserted as the admin and the instructor who
-- will really make the calls.
begin;
create schema tap;
create extension pgtap with schema tap;
grant usage on schema tap to anon, authenticated, worker;
set local search_path = public, tap;
grant anon, authenticated, worker to current_user with inherit false, set true;
select plan(14);

insert into neon_auth."user" (id, name, email, "emailVerified") values
  ('b0000000-0000-0000-0000-000000000001', 'Head', 'head@tests.invalid', true),
  ('b0000000-0000-0000-0000-000000000002', 'Ife', 'ife@tests.invalid', true);
insert into public.staff (id, full_name, email, role) values
  ('b0000000-0000-0000-0000-000000000001', 'Head', 'head@tests.invalid', 'admin'),
  ('b0000000-0000-0000-0000-000000000002', 'Ife', 'ife@tests.invalid', 'instructor');

-- ── as the instructor ──────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "b0000000-0000-0000-0000-000000000002"}', true);

select throws_ok($$ select public.invite_staff('new@tests.invalid', 'New Person') $$,
  '42501', null, 'an instructor cannot invite staff');

update public.staff set role = 'admin' where id = 'b0000000-0000-0000-0000-000000000002';
select is((select role::text from public.staff where id = 'b0000000-0000-0000-0000-000000000002'),
  'instructor', 'an instructor cannot promote themselves (the update matches no rows)');

-- ── as the admin ───────────────────────────────────────────────────────

select set_config('request.jwt.claims', '{"sub": "b0000000-0000-0000-0000-000000000001"}', true);

select lives_ok($$ select public.invite_staff(' Tunde@Tests.Invalid ', ' Tunde Bello ', 'instructor') $$,
  'an admin invites a new instructor');

reset role;
select is((select count(*)::int from neon_auth."user" where email = 'tunde@tests.invalid'), 1,
  'the invitation creates a Neon Auth user with the email normalised');
select is(
  (select s.id from public.staff s where s.email = 'tunde@tests.invalid'),
  (select u.id from neon_auth."user" u where u.email = 'tunde@tests.invalid'),
  'and a staff row with the same id');
select is((select full_name from public.staff where email = 'tunde@tests.invalid'), 'Tunde Bello',
  'with the name trimmed');
select ok(exists (
  select 1 from public.audit_log
  where table_name = 'staff' and actor = 'b0000000-0000-0000-0000-000000000001'
), 'the audit log records which admin invited them');
set local role authenticated;

select throws_ok($$ select public.invite_staff('tunde@tests.invalid', 'Tunde Again') $$,
  '23514', null, 'inviting someone already on staff is refused');
select throws_ok($$ select public.invite_staff('not-an-email', 'Nobody') $$,
  '22023', null, 'a malformed email is refused');
select throws_ok($$ select public.invite_staff('blank@tests.invalid', '   ') $$,
  '22023', null, 'a blank name is refused');

select lives_ok($$ update public.staff set active = false where email = 'ife@tests.invalid' $$,
  'an admin deactivates another member of staff');
select throws_ok(
  $$ update public.staff set active = false where id = 'b0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'an admin cannot deactivate themselves');
select throws_ok(
  $$ update public.staff set role = 'instructor' where id = 'b0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'an admin cannot demote themselves');
select throws_ok(
  $$ update public.staff set email = 'other@tests.invalid' where email = 'tunde@tests.invalid' $$,
  '23514', null, 'a staff email cannot be changed');

reset role;
select * from finish();
rollback;
