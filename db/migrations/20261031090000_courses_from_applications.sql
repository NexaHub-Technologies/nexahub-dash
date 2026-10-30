-- Courses register themselves.
--
-- The website owns its catalogue (src/lib/courses.ts in nexahubtech) and the
-- console no longer copies it. But applications and cohorts point at a row in
-- public.courses, so an application for a course the console has never seen
-- would be refused. Instead, the first application for an unfamiliar course
-- adds the course, with a title made from its slug ("ui-ux-design" becomes
-- "Ui Ux Design"). Courses already here keep their titles.
--
--   sequenceDiagram
--     participant web as website (anon)
--     participant trg as ensure_course (BEFORE INSERT)
--     participant courses as public.courses
--     participant apps as public.applications
--     web->>apps: insert application (course_slug)
--     apps->>trg: fires first
--     trg->>courses: insert slug, title ... on conflict do nothing
--     Note right of courses: the slug check still refuses a malformed slug (23514)
--     trg-->>apps: row continues, the foreign key now holds
--
-- The website's role still cannot write to courses directly; it can only
-- cause a row by applying.

create function private.ensure_course() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.courses (slug, title)
  values (new.course_slug, initcap(replace(new.course_slug, '-', ' ')))
  on conflict (slug) do nothing;
  return new;
end;
$$;

create trigger applications_ensure_course before insert on public.applications
  for each row execute function private.ensure_course();

revoke all on function private.ensure_course() from public, anon, authenticated, worker;
