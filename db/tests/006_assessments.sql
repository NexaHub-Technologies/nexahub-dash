-- Assessments: the admin's track, assignments and marks; what a student can
-- reach through the my_* functions; and that nobody else reaches anything.
begin;
create schema tap;
create extension pgtap with schema tap;
grant usage on schema tap to anon, authenticated, worker;
set local search_path = public, tap;
grant anon, authenticated, worker to current_user with inherit false, set true;
select plan(45);

insert into neon_auth."user" (id, name, email, "emailVerified") values
  ('d0000000-0000-0000-0000-000000000001', 'Head', 'head@tests.invalid', true),
  ('d0000000-0000-0000-0000-000000000002', 'Ife', 'ife@tests.invalid', true);
insert into public.staff (id, full_name, email, role) values
  ('d0000000-0000-0000-0000-000000000001', 'Head', 'head@tests.invalid', 'admin'),
  ('d0000000-0000-0000-0000-000000000002', 'Ife', 'ife@tests.invalid', 'instructor');
insert into public.courses (slug, title) values
  ('work-course', 'Work Course'), ('other-course', 'Other Course');
insert into public.students (id, full_name, email) values
  ('d0000000-0000-0000-0000-0000000000a1', 'Ada Obi', 'Ada@tests.invalid'),
  ('d0000000-0000-0000-0000-0000000000a2', 'Bola Ade', 'bola@tests.invalid'),
  ('d0000000-0000-0000-0000-0000000000a3', 'Ife Staff', 'ife@tests.invalid');
insert into public.enrolments (id, student_id, course_slug, status) values
  ('d0000000-0000-0000-0000-0000000000e1', 'd0000000-0000-0000-0000-0000000000a1', 'work-course', 'active'),
  ('d0000000-0000-0000-0000-0000000000e2', 'd0000000-0000-0000-0000-0000000000a2', 'work-course', 'active'),
  ('d0000000-0000-0000-0000-0000000000e3', 'd0000000-0000-0000-0000-0000000000a2', 'other-course', 'active');

-- ── as the admin ───────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "d0000000-0000-0000-0000-000000000001"}', true);

select lives_ok($$
  insert into public.assessments (id, course_slug, kind, title, brief, max_score, position) values
    ('d0000000-0000-0000-0000-0000000000b1', 'work-course', 'project', 'Build a site', 'Three pages.', 100, 1),
    ('d0000000-0000-0000-0000-0000000000b2', 'work-course', 'exercise', 'Warm-up', 'Ten questions.', 10, 2)
$$, 'the admin types in a course''s track');
select is((select created_by from public.assessments where id = 'd0000000-0000-0000-0000-0000000000b1'),
  'd0000000-0000-0000-0000-000000000001'::uuid, 'which records who added it');

insert into public.assessment_files (assessment_id, name, storage_key, size_bytes)
values ('d0000000-0000-0000-0000-0000000000b1', 'brief.pdf', 'briefs/d0000000-0000-0000-0000-0000000000b1/x/brief.pdf', 2048);

select lives_ok($$
  insert into public.assignments (id, assessment_id, enrolment_id, opened_at) values
    ('d0000000-0000-0000-0000-0000000000c1', 'd0000000-0000-0000-0000-0000000000b1', 'd0000000-0000-0000-0000-0000000000e1', null),
    ('d0000000-0000-0000-0000-0000000000c2', 'd0000000-0000-0000-0000-0000000000b2', 'd0000000-0000-0000-0000-0000000000e1', now()),
    ('d0000000-0000-0000-0000-0000000000c3', 'd0000000-0000-0000-0000-0000000000b1', 'd0000000-0000-0000-0000-0000000000e2', now())
$$, 'and assigns the work, locked or open');

select throws_ok($$
  insert into public.assignments (assessment_id, enrolment_id)
  values ('d0000000-0000-0000-0000-0000000000b1', 'd0000000-0000-0000-0000-0000000000e3')
$$, '23514', 'That student isn''t on this assessment''s course', 'only to students on its course');
select throws_ok($$
  insert into public.assignments (assessment_id, enrolment_id)
  values ('d0000000-0000-0000-0000-0000000000b1', 'd0000000-0000-0000-0000-0000000000e1')
$$, '23505', null, 'and only once each');

select throws_ok($$ update public.assignments set score = 11 where id = 'd0000000-0000-0000-0000-0000000000c2' $$,
  '23514', 'The score can''t be more than 10', 'a score can''t exceed the maximum');
select lives_ok($$ update public.assignments set score = 8, feedback = 'Good' where id = 'd0000000-0000-0000-0000-0000000000c2' $$,
  'the admin enters a score and feedback');
select is((select marked_by from public.assignments where id = 'd0000000-0000-0000-0000-0000000000c2'),
  'd0000000-0000-0000-0000-000000000001'::uuid, 'which is stamped with who marked it');
select throws_ok($$ update public.assessments set max_score = 5 where id = 'd0000000-0000-0000-0000-0000000000b2' $$,
  '23514', 'A student already has a score above 5', 'the maximum can''t drop below a score given');
select throws_ok($$ update public.assessments set course_slug = 'other-course' where id = 'd0000000-0000-0000-0000-0000000000b2' $$,
  '23514', null, 'and an assessment stays on its course');
update public.assignments set score = null where id = 'd0000000-0000-0000-0000-0000000000c2';
select is((select marked_at from public.assignments where id = 'd0000000-0000-0000-0000-0000000000c2'),
  null, 'clearing the score clears the mark');

select throws_ok($$
  insert into public.submission_files (assignment_id, name, storage_key, size_bytes)
  values ('d0000000-0000-0000-0000-0000000000c3', 'fake.zip', 'submissions/d0000000-0000-0000-0000-0000000000c3/f/fake.zip', 10)
$$, '42501', null, 'the admin can''t add a file that looks like the student''s own');
select lives_ok($$
  insert into public.submission_files (assignment_id, name, storage_key, size_bytes, staff_id)
  values ('d0000000-0000-0000-0000-0000000000c3', 'marked.pdf', 'submissions/d0000000-0000-0000-0000-0000000000c3/s/marked.pdf', 10,
          'd0000000-0000-0000-0000-000000000001')
$$, 'but can add one as themselves');
select throws_ok($$
  insert into public.assessment_files (assessment_id, name, storage_key, size_bytes)
  values ('d0000000-0000-0000-0000-0000000000b1', 'huge.zip', 'briefs/huge', 26214401)
$$, '23514', null, 'a file over 25 MB is refused');

-- logins (neon_auth is read as the owner; nobody else can)
select lives_ok($$ select public.set_student_login('d0000000-0000-0000-0000-0000000000a1', repeat('h', 64)) $$,
  'the admin creates a student''s login');
reset role;
select is((select u.email from public.students s join neon_auth."user" u on u.id = s.auth_user_id
  where s.id = 'd0000000-0000-0000-0000-0000000000a1'), 'ada@tests.invalid', 'under their email, lower-cased');
select is((select count(*)::int from neon_auth.account a join public.students s on s.auth_user_id = a."userId"
  where s.id = 'd0000000-0000-0000-0000-0000000000a1' and a."providerId" = 'credential' and a.password = repeat('h', 64)),
  1, 'with the password hash stored for Neon Auth');
set local role authenticated;
select public.set_student_login('d0000000-0000-0000-0000-0000000000a1', repeat('i', 64));
select throws_ok($$ select public.set_student_login('d0000000-0000-0000-0000-0000000000a3', repeat('h', 64)) $$,
  '23514', null, 'a student with a staff email gets no student login');
update public.students set email = 'ada.obi@tests.invalid' where id = 'd0000000-0000-0000-0000-0000000000a1';
select public.set_student_login('d0000000-0000-0000-0000-0000000000a2', repeat('h', 64));
reset role;
select is((select count(*)::int from neon_auth.account a join public.students s on s.auth_user_id = a."userId"
  where s.id = 'd0000000-0000-0000-0000-0000000000a1' and a.password = repeat('i', 64)),
  1, 'a second call replaces the password rather than adding a login');
select is((select u.email from public.students s join neon_auth."user" u on u.id = s.auth_user_id
  where s.id = 'd0000000-0000-0000-0000-0000000000a1'), 'ada.obi@tests.invalid', 'a corrected email follows through to the login');
set local role authenticated;

-- ── as an instructor ───────────────────────────────────────────────────

select set_config('request.jwt.claims', '{"sub": "d0000000-0000-0000-0000-000000000002"}', true);

select is((select count(*)::int from public.assessments) + (select count(*)::int from public.assignments)
  + (select count(*)::int from public.assessment_files) + (select count(*)::int from public.submission_files),
  0, 'an instructor sees no assessments, assignments or files');
select throws_ok($$ select public.set_student_login('d0000000-0000-0000-0000-0000000000a2', repeat('h', 64)) $$,
  '42501', null, 'and can''t manage logins');
select is((select count(*)::int from public.my_assignments()), 0, 'the my_* functions give staff nothing');

-- ── as a student (Ada) ─────────────────────────────────────────────────

reset role;
select set_config('test.ada', (select auth_user_id::text from public.students
  where id = 'd0000000-0000-0000-0000-0000000000a1'), true);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.ada'))::text, true);

select is((select full_name from public.my_profile()), 'Ada Obi', 'a student is recognised by their login');
select is((select count(*)::int from public.assessments) + (select count(*)::int from public.assignments)
  + (select count(*)::int from public.students), 0, 'a student reads no table directly');
select is((select count(*)::int from public.my_assignments()), 2, 'a student sees their own work only');
select is((select brief from public.my_assignments() where id = 'd0000000-0000-0000-0000-0000000000c1'),
  null, 'a locked project keeps its brief back');
select is((select title from public.my_assignments() where id = 'd0000000-0000-0000-0000-0000000000c1'),
  'Build a site', 'but shows its title');
select is((select count(*)::int from public.my_assignment_files('d0000000-0000-0000-0000-0000000000c1')),
  0, 'and gives out none of its files');
select throws_ok($$ select public.my_submit_file('d0000000-0000-0000-0000-0000000000c1', 'a.zip',
  'submissions/d0000000-0000-0000-0000-0000000000c1/u/a.zip', 100, 'application/zip') $$,
  '42501', null, 'nor takes an upload');
select is((select count(*)::int from public.my_assignment_files('d0000000-0000-0000-0000-0000000000c3')),
  0, 'another student''s files are out of reach');

select lives_ok($$ select public.my_submit_file('d0000000-0000-0000-0000-0000000000c2', 'answers.pdf',
  'submissions/d0000000-0000-0000-0000-0000000000c2/u/answers.pdf', 100, '') $$,
  'a student uploads work to an open exercise');
select throws_ok($$ select public.my_submit_file('d0000000-0000-0000-0000-0000000000c2', 'theirs.zip',
  'submissions/d0000000-0000-0000-0000-0000000000c3/u/theirs.zip', 100, 'application/zip') $$,
  '22023', null, 'but can''t claim a file from another folder');
select isnt((select submitted_at from public.my_assignments() where id = 'd0000000-0000-0000-0000-0000000000c2'),
  null, 'the upload shows as submitted');

-- the admin opens the project, then marks the exercise
select set_config('request.jwt.claims', '{"sub": "d0000000-0000-0000-0000-000000000001"}', true);
update public.assignments set opened_at = now() where id = 'd0000000-0000-0000-0000-0000000000c1';
update public.assignments set score = 9 where id = 'd0000000-0000-0000-0000-0000000000c2';
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.ada'))::text, true);

select is((select count(*)::int from public.my_assignment_files('d0000000-0000-0000-0000-0000000000c1')),
  1, 'once opened, the project''s brief file is there to download');
select throws_ok($$ select public.my_remove_file((select id from public.my_assignment_files('d0000000-0000-0000-0000-0000000000c2')
  where source = 'mine')) $$, '23514', null, 'marked work can''t be changed');

-- the admin takes the login away
select set_config('request.jwt.claims', '{"sub": "d0000000-0000-0000-0000-000000000001"}', true);
select public.remove_student_login('d0000000-0000-0000-0000-0000000000a1');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.ada'))::text, true);
select is((select count(*)::int from public.my_assignments()), 0, 'a removed login reaches nothing');

-- ── deleting a student ─────────────────────────────────────────────────
-- Bola has a login, an open project with a staff file, and an unpaid invoice

select set_config('request.jwt.claims', '{"sub": "d0000000-0000-0000-0000-000000000001"}', true);
insert into public.invoices (id, enrolment_id, description, amount_kobo, due_on) values
  ('d0000000-0000-0000-0000-0000000000f1', 'd0000000-0000-0000-0000-0000000000e2', 'Tuition', 500000, current_date),
  ('d0000000-0000-0000-0000-0000000000f2', 'd0000000-0000-0000-0000-0000000000e1', 'Tuition', 500000, current_date);
insert into public.payments (invoice_id, amount_kobo, method, reference, recorded_by)
values ('d0000000-0000-0000-0000-0000000000f2', 1000, 'cash', 'DEL-1', 'd0000000-0000-0000-0000-000000000001');

select throws_ok($$ select public.delete_student('d0000000-0000-0000-0000-0000000000a1') $$,
  '23514', 'Ada Obi has payments on record and can''t be deleted. Set their status to Withdrawn instead.',
  'a student with payments on record can''t be deleted');
select throws_ok($$ delete from public.students where id = 'd0000000-0000-0000-0000-0000000000a2' $$,
  '23503', null, 'a plain delete is stopped by the student''s invoice');

select set_config('request.jwt.claims', '{"sub": "d0000000-0000-0000-0000-000000000002"}', true);
select throws_ok($$ select public.delete_student('d0000000-0000-0000-0000-0000000000a2') $$,
  '42501', null, 'an instructor can''t delete a student');

select set_config('request.jwt.claims', '{"sub": "d0000000-0000-0000-0000-000000000001"}', true);
select is(public.delete_student('d0000000-0000-0000-0000-0000000000a2'),
  array['submissions/d0000000-0000-0000-0000-0000000000c3/s/marked.pdf'],
  'the admin deletes a student with no payments, and gets their files'' keys back');
select is((select count(*)::int from public.students where id = 'd0000000-0000-0000-0000-0000000000a2')
  + (select count(*)::int from public.enrolments where student_id = 'd0000000-0000-0000-0000-0000000000a2')
  + (select count(*)::int from public.invoices where id = 'd0000000-0000-0000-0000-0000000000f1')
  + (select count(*)::int from public.assignments where id = 'd0000000-0000-0000-0000-0000000000c3'),
  0, 'their enrolments, unpaid invoice and assigned work go with them');
select is((select count(*)::int from public.assessments), 2, 'the course''s assessments stay');
select is((select count(*)::int from public.audit_log where action = 'delete_student'
  and row_id = 'd0000000-0000-0000-0000-0000000000a2'), 1, 'the deletion is in the audit log');
reset role;
select is((select count(*)::int from neon_auth."user" where email = 'bola@tests.invalid'),
  0, 'and their login is gone');

select * from finish();
rollback;
