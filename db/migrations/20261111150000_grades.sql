-- Work is graded in words, not numbers.
--
-- An admin now gives a piece of work one of four grades (Bad, Good, Very
-- good, Excellent) with written feedback, where before they entered a score
-- out of a maximum. The maximum goes from assessments and the score from
-- assignments. A score already entered is carried over by its share of the
-- maximum: under 50% Bad, under 70% Good, under 85% Very good, otherwise
-- Excellent.
--
-- "Marked" now means "has a grade": the student's uploads lock once a
-- grade is given and reopen when it is cleared, as they did with a score.

create type public.assessment_grade as enum ('bad', 'good', 'very_good', 'excellent');

alter table public.assignments add column grade public.assessment_grade;

update public.assignments g
set grade = case
    when g.score * 100 < a.max_score * 50 then 'bad'
    when g.score * 100 < a.max_score * 70 then 'good'
    when g.score * 100 < a.max_score * 85 then 'very_good'
    else 'excellent'
  end::public.assessment_grade
from public.assessments a
where a.id = g.assessment_id and g.score is not null;

-- ── rules ───────────────────────────────────────────────────────────────

-- whoever gives, changes or clears a grade is stamped on the row
create or replace function private.assignment_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_assessment_course text;
  v_course text;
begin
  select course_slug into v_assessment_course from public.assessments where id = new.assessment_id;
  select course_slug into v_course from public.enrolments where id = new.enrolment_id;
  if v_course is distinct from v_assessment_course then
    raise exception 'That student isn''t on this assessment''s course' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE'
     and (new.assessment_id <> old.assessment_id or new.enrolment_id <> old.enrolment_id) then
    raise exception 'An assignment can''t be moved; remove it and assign again'
      using errcode = '23514';
  end if;

  if new.grade is null then
    new.marked_by := null;
    new.marked_at := null;
  elsif tg_op = 'INSERT'
        or new.grade is distinct from old.grade
        or new.feedback is distinct from old.feedback then
    new.marked_by := private.uid();
    new.marked_at := now();
  end if;
  return new;
end;
$$;

create or replace function private.assessment_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.course_slug <> old.course_slug then
    raise exception 'An assessment can''t move to another course' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ── what a student sees ─────────────────────────────────────────────────
-- my_assignments() returns different columns now, so it is made again

drop function public.my_assignments();

create function public.my_assignments()
returns table (
  id uuid,
  course_slug text,
  course text,
  kind public.assessment_kind,
  title text,
  brief text,
  locked boolean,
  opened_at timestamptz,
  due_on date,
  grade public.assessment_grade,
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
    g.opened_at is null,
    g.opened_at,
    case when g.opened_at is not null then g.due_on end,
    case when g.opened_at is not null then g.grade end,
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

revoke all on function public.my_assignments() from public, anon;
grant execute on function public.my_assignments() to authenticated;

create or replace function public.my_submit_file(
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
  if (select grade from public.assignments where id = p_assignment for update) is not null then
    raise exception 'This work has been graded. Ask your tutor to reopen it.' using errcode = '23514';
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

create or replace function public.my_remove_file(p_file uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_file public.submission_files;
begin
  select * into v_file from public.submission_files where id = p_file and staff_id is null;
  if not found or not private.my_open_assignment(v_file.assignment_id) then
    raise exception 'That file isn''t yours to remove' using errcode = '42501';
  end if;
  if (select grade from public.assignments where id = v_file.assignment_id) is not null then
    raise exception 'This work has been graded, so its files can''t be removed'
      using errcode = '23514';
  end if;
  delete from public.submission_files where id = p_file;
  return v_file.storage_key;
end;
$$;

-- ── the numbers go ──────────────────────────────────────────────────────

alter table public.assignments drop column score;
alter table public.assessments drop column max_score;
