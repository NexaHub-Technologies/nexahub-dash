-- Courses register themselves from applications, asserted as the website
-- (anon), which is who really sends them.
begin;
create schema tap;
create extension pgtap with schema tap;
grant usage on schema tap to anon, authenticated, worker;
set local search_path = public, tap;
grant anon, authenticated, worker to current_user with inherit false, set true;
select plan(10);

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

reset role;

-- the website's catalogue, as 20261124090000_website_courses.sql left it
select is((select title from public.courses where slug = 'computer-essentials'), 'Computer Essentials',
  'the catalogue carries the website''s courses');
select ok(not exists (select 1 from public.courses where slug in ('pc-basics', 'microsoft-office', 'cybersecurity')),
  'and not the courses it has renamed or dropped');
select is((select (default_fee_kobo, in_person_fee_kobo)::text from public.courses where slug = 'office-essentials'),
  '(8000000,9500000)', 'with an online and an in-person fee');
select is((select count(*)::int from public.course_modules where course_slug = 'ai-for-office-use'), 4,
  'and its modules');

select * from finish();
rollback;
