-- Changing staff, asserted as the admin and the instructor who would really
-- make the calls. There is one admin today, so the guard against an admin
-- removing their own access is what keeps the dashboard reachable.
begin;
create schema tap;
create extension pgtap with schema tap;
grant usage on schema tap to anon, authenticated, worker;
set local search_path = public, tap;
grant anon, authenticated, worker to current_user with inherit false, set true;
select plan(6);

insert into neon_auth."user" (id, name, email, "emailVerified") values
  ('b0000000-0000-0000-0000-000000000001', 'Head', 'head@tests.invalid', true),
  ('b0000000-0000-0000-0000-000000000002', 'Ife', 'ife@tests.invalid', true);
insert into public.staff (id, full_name, email, role) values
  ('b0000000-0000-0000-0000-000000000001', 'Head', 'head@tests.invalid', 'admin'),
  ('b0000000-0000-0000-0000-000000000002', 'Ife', 'ife@tests.invalid', 'instructor');

-- ── as the instructor ──────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "b0000000-0000-0000-0000-000000000002"}', true);

update public.staff set role = 'admin' where id = 'b0000000-0000-0000-0000-000000000002';
select is((select role::text from public.staff where id = 'b0000000-0000-0000-0000-000000000002'),
  'instructor', 'an instructor cannot promote themselves (the update matches no rows)');

-- ── as the admin ───────────────────────────────────────────────────────

select set_config('request.jwt.claims', '{"sub": "b0000000-0000-0000-0000-000000000001"}', true);

select lives_ok($$ update public.staff set active = false where email = 'ife@tests.invalid' $$,
  'an admin deactivates another member of staff');
select throws_ok(
  $$ update public.staff set active = false where id = 'b0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'an admin cannot deactivate themselves');
select throws_ok(
  $$ update public.staff set role = 'instructor' where id = 'b0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'an admin cannot demote themselves');
select throws_ok(
  $$ update public.staff set email = 'other@tests.invalid' where email = 'ife@tests.invalid' $$,
  '23514', null, 'a staff email cannot be changed');

reset role;
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('invite_staff', 'can_sign_in')
), 'the magic-link and invitation functions are gone');

select * from finish();
rollback;
