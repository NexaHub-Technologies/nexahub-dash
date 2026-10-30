-- Courses register themselves from applications, asserted as the website
-- (anon), which is who really sends them.
begin;
create schema tap;
create extension pgtap with schema tap;
grant usage on schema tap to anon, authenticated, worker;
set local search_path = public, tap;
grant anon, authenticated, worker to current_user with inherit false, set true;
select plan(6);

insert into public.courses (slug, title) values ('known-course', 'Known Course, Properly Titled');

set local role anon;
select set_config('request.jwt.claims', '', true);

select lives_ok($$
  insert into public.applications
    (course_slug, full_name, email, phone, gender, employment, mode,
     has_experience, has_laptop, heard_from, can_commit, notify_consent)
  values ('ui-ux-design', 'Ada Obi', 'ada@example.com', '+2348030000001', 'Female', 'Student',
          'Online training', false, true, 'Social media', true, true)
$$, 'the website can apply for a course the console has never seen');

select lives_ok($$
  insert into public.applications
    (course_slug, full_name, email, phone, gender, employment, mode,
     has_experience, has_laptop, heard_from, can_commit, notify_consent)
  values ('known-course', 'Bayo Ade', 'bayo@example.com', '+2348030000002', 'Male', 'Employed',
          'Online training', true, true, 'Friend or referral', true, true)
$$, 'and for one it already knows');

select throws_ok($$ insert into public.courses (slug, title) values ('sneaky', 'Sneaky') $$,
  '42501', null, 'the website still cannot add courses directly');

select throws_ok($$
  insert into public.applications
    (course_slug, full_name, email, phone, gender, employment, mode,
     has_experience, has_laptop, heard_from, can_commit, notify_consent)
  values ('Not A Slug!', 'Eve', 'eve@example.com', '+2348030000009', 'Female', 'Student',
          'Online training', false, true, 'Other', true, true)
$$, '23514', null, 'a malformed course slug is still refused');

reset role;
select is((select title from public.courses where slug = 'ui-ux-design'), 'Ui Ux Design',
  'the new course gets a readable title from its slug');
select is((select title from public.courses where slug = 'known-course'), 'Known Course, Properly Titled',
  'a known course keeps its title');

select * from finish();
rollback;
