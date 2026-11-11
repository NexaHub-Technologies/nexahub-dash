-- Assessments: the projects and exercises a course sets, who they are
-- assigned to, the files that go with them, and the marks.
--
-- An admin types in each course's assessment track by hand (assessments),
-- attaches the files a student needs (assessment_files) and assigns the
-- work to students on the course (assignments). An assignment is locked
-- until the admin opens it: a locked one shows the student its title and
-- nothing else. Once it is open the student reads the brief, downloads its
-- files and uploads their work (submission_files); the admin downloads
-- that, enters a score and feedback, and may upload a file back.
--
-- The files themselves live in object storage. A row here holds the key,
-- and the server hands out a short-lived link only after the database has
-- said the caller may have that file.
--
-- Students sign in for the first time with this migration. A student's
-- login is a Neon Auth user, linked from students.auth_user_id; the admin
-- creates it and gives the student the password. Students never touch the
-- tables: everything they can do is one of the my_* functions below, each
-- of which starts from the caller's own student row.
--
--   stateDiagram-v2
--     [*] --> locked: assigned (a project)
--     [*] --> open: assigned (an exercise)
--     locked --> open: admin opens
--     open --> locked: admin locks
--     open --> submitted: student uploads
--     submitted --> open: student removes their files
--     open --> marked: admin enters a score
--     submitted --> marked: admin enters a score
--     marked --> submitted: admin clears the score
--
--   | table                          | student            | instructor | admin |
--   |--------------------------------|--------------------|------------|-------|
--   | assessments, assessment_files  | my_* functions     | —          | all   |
--   | assignments, submission_files  | my_* functions     | —          | all   |

-- ── student logins ──────────────────────────────────────────────────────

alter table public.students
  add column auth_user_id uuid unique references neon_auth."user" (id) on delete set null;

-- The caller's student row, or null for staff and anyone else.
create function private.student_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.students where auth_user_id = private.uid();
$$;

-- Creates a student's login or gives it a new password. The server hashes
-- the password the way Neon Auth does and passes only the hash. Any session
-- the student had is ended, so an old password stops working at once.
create function public.set_student_login(p_student uuid, p_password_hash text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_student public.students;
  v_email text;
  v_user uuid;
begin
  if not private.is_admin() then
    raise exception 'Only an admin can manage student logins' using errcode = '42501';
  end if;
  select * into v_student from public.students where id = p_student for update;
  if not found then
    raise exception 'No such student' using errcode = '22023';
  end if;
  if coalesce(char_length(p_password_hash), 0) < 32 then
    raise exception 'That password could not be stored' using errcode = '22023';
  end if;
  v_email := lower(v_student.email);
  if exists (select 1 from public.staff where lower(email) = v_email) then
    raise exception '% is a member of staff and signs in with their staff account', v_email
      using errcode = '23514';
  end if;

  if v_student.auth_user_id is not null then
    v_user := v_student.auth_user_id;
    update neon_auth."user" set name = v_student.full_name, email = v_email, "updatedAt" = now()
    where id = v_user;
  else
    insert into neon_auth."user" (name, email, "emailVerified")
    values (v_student.full_name, v_email, true)
    on conflict (email) do update set name = excluded.name, "updatedAt" = now()
    returning id into v_user;
    update public.students set auth_user_id = v_user where id = p_student;
  end if;

  update neon_auth.account set password = p_password_hash, "updatedAt" = now()
  where "userId" = v_user and "providerId" = 'credential';
  if not found then
    insert into neon_auth.account ("accountId", "providerId", "userId", password, "updatedAt")
    values (v_user::text, 'credential', v_user, p_password_hash, now());
  end if;
  delete from neon_auth.session where "userId" = v_user;

  insert into public.audit_log (action, table_name, row_id, detail)
  values ('set_login', 'students', p_student::text, jsonb_build_object('email', v_email));
end;
$$;

-- Takes a student's login away: they are signed out and can't sign back in.
-- Their work and marks stay.
create function public.remove_student_login(p_student uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if not private.is_admin() then
    raise exception 'Only an admin can manage student logins' using errcode = '42501';
  end if;
  select auth_user_id into v_user from public.students where id = p_student for update;
  if v_user is null then
    raise exception 'This student has no login' using errcode = '22023';
  end if;
  update public.students set auth_user_id = null where id = p_student;
  delete from neon_auth.session where "userId" = v_user;
  delete from neon_auth.account where "userId" = v_user and "providerId" = 'credential';

  insert into public.audit_log (action, table_name, row_id, detail)
  values ('remove_login', 'students', p_student::text, '{}');
end;
$$;

-- a corrected name or email on the student follows through to their login
create function private.student_login_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.auth_user_id is not null
     and (new.email is distinct from old.email or new.full_name is distinct from old.full_name) then
    if exists (
      select 1 from neon_auth."user" where email = lower(new.email) and id <> new.auth_user_id
    ) then
      raise exception 'Another login already uses %', lower(new.email) using errcode = '23514';
    end if;
    update neon_auth."user" set email = lower(new.email), name = new.full_name, "updatedAt" = now()
    where id = new.auth_user_id;
  end if;
  return new;
end;
$$;

create trigger student_login_sync after update on public.students
  for each row execute function private.student_login_sync();

-- ── tables ──────────────────────────────────────────────────────────────

create type public.assessment_kind as enum ('project', 'exercise');

-- one piece of work on a course's track
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  course_slug text not null references public.courses (slug),
  kind public.assessment_kind not null,
  title text not null check (char_length(title) between 1 and 160),
  brief text not null default '' check (char_length(brief) <= 5000),
  max_score smallint not null default 100 check (max_score between 1 and 1000),
  -- where it sits in the course's track, lowest first
  position integer not null default 0,
  created_by uuid references public.staff (id) default private.uid(),
  created_at timestamptz not null default now()
);
create index assessments_course on public.assessments (course_slug, position, created_at);

-- 25 MB a file, here and in the upload link the server signs
create table public.assessment_files (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  storage_key text not null unique,
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  content_type text not null default 'application/octet-stream' check (char_length(content_type) <= 200),
  uploaded_by uuid references public.staff (id) default private.uid(),
  created_at timestamptz not null default now()
);
create index assessment_files_assessment on public.assessment_files (assessment_id);

-- an assessment given to one student, on one of their enrolments
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  enrolment_id uuid not null references public.enrolments (id) on delete cascade,
  -- null while it is locked
  opened_at timestamptz,
  due_on date,
  score smallint check (score >= 0),
  feedback text check (char_length(feedback) <= 4000),
  marked_by uuid references public.staff (id),
  marked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (assessment_id, enrolment_id)
);
create index assignments_enrolment on public.assignments (enrolment_id);

-- staff_id is null for the student's own upload; set for a file an admin
-- added on the student's behalf or handed back with the mark
create table public.submission_files (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  storage_key text not null unique,
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  content_type text not null default 'application/octet-stream' check (char_length(content_type) <= 200),
  staff_id uuid references public.staff (id),
  created_at timestamptz not null default now()
);
create index submission_files_assignment on public.submission_files (assignment_id);

-- ── rules ───────────────────────────────────────────────────────────────

-- An assignment joins an assessment to an enrolment on the same course. A
-- score can't exceed the assessment's maximum, and whoever enters, changes
-- or clears it is stamped on the row.
create function private.assignment_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_assessment public.assessments;
  v_course text;
begin
  select * into v_assessment from public.assessments where id = new.assessment_id;
  select course_slug into v_course from public.enrolments where id = new.enrolment_id;
  if v_course is distinct from v_assessment.course_slug then
    raise exception 'That student isn''t on this assessment''s course' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE'
     and (new.assessment_id <> old.assessment_id or new.enrolment_id <> old.enrolment_id) then
    raise exception 'An assignment can''t be moved; remove it and assign again'
      using errcode = '23514';
  end if;
  if new.score > v_assessment.max_score then
    raise exception 'The score can''t be more than %', v_assessment.max_score using errcode = '23514';
  end if;

  if new.score is null then
    new.marked_by := null;
    new.marked_at := null;
  elsif tg_op = 'INSERT'
        or new.score is distinct from old.score
        or new.feedback is distinct from old.feedback then
    new.marked_by := private.uid();
    new.marked_at := now();
  end if;
  return new;
end;
$$;

create trigger assignment_before before insert or update on public.assignments
  for each row execute function private.assignment_before();

-- lowering the maximum below a score already given is refused
create function private.assessment_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.course_slug <> old.course_slug then
    raise exception 'An assessment can''t move to another course' using errcode = '23514';
  end if;
  if new.max_score < old.max_score and exists (
    select 1 from public.assignments where assessment_id = new.id and score > new.max_score
  ) then
    raise exception 'A student already has a score above %', new.max_score using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger assessment_before_update before update on public.assessments
  for each row execute function private.assessment_before_update();

create trigger audit after insert or update or delete on public.assessments
  for each row execute function private.audit();
create trigger audit after insert or update or delete on public.assignments
  for each row execute function private.audit();

-- ── access ──────────────────────────────────────────────────────────────

grant select, insert, update, delete on
  public.assessments, public.assessment_files, public.assignments, public.submission_files
  to authenticated;

alter table public.assessments enable row level security;
alter table public.assessment_files enable row level security;
alter table public.assignments enable row level security;
alter table public.submission_files enable row level security;

create policy assessments_admin on public.assessments for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy assessment_files_admin on public.assessment_files for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy assignments_admin on public.assignments for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
-- an admin's own uploads carry their id, never a student's blank
create policy submission_files_admin_select on public.submission_files for select to authenticated
  using (private.is_admin());
create policy submission_files_admin_insert on public.submission_files for insert to authenticated
  with check (private.is_admin() and staff_id = private.uid());
create policy submission_files_admin_delete on public.submission_files for delete to authenticated
  using (private.is_admin());

-- ── what a student can do ───────────────────────────────────────────────

-- who the caller is, when they are a student
create function public.my_profile()
returns table (id uuid, full_name text, email text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.full_name, s.email from public.students s where s.id = private.student_id();
$$;

-- The caller's work, in track order. A locked assignment gives its title
-- and kind and keeps the rest back.
create function public.my_assignments()
returns table (
  id uuid,
  course_slug text,
  course text,
  kind public.assessment_kind,
  title text,
  brief text,
  max_score smallint,
  locked boolean,
  opened_at timestamptz,
  due_on date,
  score smallint,
  feedback text,
  marked_at timestamptz,
  submitted_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    g.id,
    a.course_slug,
    coalesce(c.title, a.course_slug),
    a.kind,
    a.title,
    case when g.opened_at is not null then a.brief end,
    a.max_score,
    g.opened_at is null,
    g.opened_at,
    case when g.opened_at is not null then g.due_on end,
    case when g.opened_at is not null then g.score end,
    case when g.opened_at is not null then g.feedback end,
    case when g.opened_at is not null then g.marked_at end,
    (select max(f.created_at) from public.submission_files f
      where f.assignment_id = g.id and f.staff_id is null)
  from public.assignments g
  join public.assessments a on a.id = g.assessment_id
  join public.enrolments e on e.id = g.enrolment_id
  left join public.courses c on c.slug = a.course_slug
  where e.student_id = private.student_id()
  order by coalesce(c.title, a.course_slug), a.position, a.created_at;
$$;

-- is this assignment the caller's, and open?
create function private.my_open_assignment(p_assignment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignments g
    join public.enrolments e on e.id = g.enrolment_id
    where g.id = p_assignment
      and e.student_id = private.student_id()
      and g.opened_at is not null
  );
$$;

-- The files of one of the caller's open assignments: the brief's ('brief'),
-- their own uploads ('mine') and anything staff added ('staff').
create function public.my_assignment_files(p_assignment uuid)
returns table (
  id uuid,
  source text,
  name text,
  size_bytes bigint,
  content_type text,
  storage_key text,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select f.id, 'brief', f.name, f.size_bytes, f.content_type, f.storage_key, f.created_at
  from public.assessment_files f
  join public.assignments g on g.assessment_id = f.assessment_id
  where g.id = p_assignment and private.my_open_assignment(p_assignment)
  union all
  select f.id, case when f.staff_id is null then 'mine' else 'staff' end,
    f.name, f.size_bytes, f.content_type, f.storage_key, f.created_at
  from public.submission_files f
  where f.assignment_id = p_assignment and private.my_open_assignment(p_assignment)
  order by 7;
$$;

-- Records a file the caller has just uploaded as their work. The key must
-- sit under this assignment's own folder, so nobody can claim another
-- student's upload. Work can be added until it is marked.
create function public.my_submit_file(
  p_assignment uuid,
  p_name text,
  p_storage_key text,
  p_size_bytes bigint,
  p_content_type text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not private.my_open_assignment(p_assignment) then
    raise exception 'This work isn''t open to you' using errcode = '42501';
  end if;
  if (select score from public.assignments where id = p_assignment for update) is not null then
    raise exception 'This work has been marked. Ask your tutor to reopen it.' using errcode = '23514';
  end if;
  if p_storage_key not like 'submissions/' || p_assignment || '/%' then
    raise exception 'That upload doesn''t belong to this work' using errcode = '22023';
  end if;
  if (select count(*) from public.submission_files
      where assignment_id = p_assignment and staff_id is null) >= 10 then
    raise exception 'You can upload up to 10 files. Remove one first, or zip them together.'
      using errcode = '23514';
  end if;

  insert into public.submission_files (assignment_id, name, storage_key, size_bytes, content_type)
  values (p_assignment, p_name, p_storage_key, p_size_bytes,
          coalesce(nullif(p_content_type, ''), 'application/octet-stream'))
  returning id into v_id;
  return v_id;
end;
$$;

-- Removes one of the caller's own uploads, until the work is marked.
-- Returns the storage key so the server can delete the file itself.
create function public.my_remove_file(p_file uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_file public.submission_files;
begin
  select * into v_file from public.submission_files where id = p_file and staff_id is null;
  if not found or not private.my_open_assignment(v_file.assignment_id) then
    raise exception 'That file isn''t yours to remove' using errcode = '42501';
  end if;
  if (select score from public.assignments where id = v_file.assignment_id) is not null then
    raise exception 'This work has been marked, so its files can''t be removed'
      using errcode = '23514';
  end if;
  delete from public.submission_files where id = p_file;
  return v_file.storage_key;
end;
$$;

-- ── exposure ────────────────────────────────────────────────────────────

revoke all on function
  public.set_student_login(uuid, text),
  public.remove_student_login(uuid),
  public.my_profile(),
  public.my_assignments(),
  public.my_assignment_files(uuid),
  public.my_submit_file(uuid, text, text, bigint, text),
  public.my_remove_file(uuid)
  from public, anon;
grant execute on function
  public.set_student_login(uuid, text),
  public.remove_student_login(uuid),
  public.my_profile(),
  public.my_assignments(),
  public.my_assignment_files(uuid),
  public.my_submit_file(uuid, text, text, bigint, text),
  public.my_remove_file(uuid)
  to authenticated;

revoke all on function
  private.student_id(),
  private.my_open_assignment(uuid),
  private.student_login_sync(),
  private.assignment_before(),
  private.assessment_before_update()
  from public, anon, authenticated, worker;
