-- The website's catalogue, as it stands (nexahubtech src/lib/courses.ts).
--
-- The console was given the catalogue once, by a sync script the website has
-- since dropped; after that a course only arrived with its first
-- application. The website has moved on, so this brings the console's list
-- back in line with it:
--
--   * two courses were renamed: PC Basics is now Computer Essentials and
--     Microsoft Office is now Office Essentials. Anything filed under the old
--     names (applications, enrolments, assessments) moves to the new ones,
--     then the old courses go.
--   * AI for Office Use and Mobile Videography are new.
--   * Cybersecurity goes: the website no longer offers it.
--   * every course takes the website's title, modules and fees.
--
-- A course is now priced two ways, live online or in person, so courses
-- gain an in-person fee beside the existing one, which becomes the online
-- fee. Approving an application suggests the fee for the way the applicant
-- asked to learn (src/lib/applications.ts).
--
-- Other courses the website doesn't list (for example ones made by the
-- tests) are left alone.

alter table public.courses
  add column in_person_fee_kobo bigint check (in_person_fee_kobo >= 0);

comment on column public.courses.default_fee_kobo is 'the fee for the course taken live online';
comment on column public.courses.in_person_fee_kobo is 'the fee for the course taken in person, when it differs';

create temporary table website_courses (
  slug text primary key,
  title text not null,
  online_kobo bigint not null,
  in_person_kobo bigint
) on commit drop;

insert into website_courses (slug, title, online_kobo, in_person_kobo) values
  ('computer-essentials', 'Computer Essentials', 6500000, 7500000),
  ('office-essentials', 'Office Essentials', 8000000, 9500000),
  ('ai-for-office-use', 'AI for Office Use', 6000000, 7500000),
  ('python-programming', 'Python Programming', 9500000, 11500000),
  ('javascript-programming', 'JavaScript Programming', 9500000, 11500000),
  ('frontend-development', 'Frontend Development', 12000000, 14500000),
  ('backend-development', 'Backend Development', 11000000, 13500000),
  ('web-development-fullstack', 'Web Development', 20000000, 24000000),
  ('react-development', 'React', 13000000, 16000000),
  ('nextjs-fullstack', 'Next.js', 16000000, 19500000),
  ('mobile-development', 'Mobile Development', 19000000, 23000000),
  ('data-analysis', 'Data Analysis', 13000000, 16000000),
  ('mobile-videography', 'Mobile Videography', 5000000, 6000000),
  ('videography-video-editing', 'Videography & Video Editing', 10000000, 12000000);

insert into public.courses (slug, title, default_fee_kobo, in_person_fee_kobo)
select slug, title, online_kobo, in_person_kobo from website_courses
on conflict (slug) do update
  set title = excluded.title,
      default_fee_kobo = excluded.default_fee_kobo,
      in_person_fee_kobo = excluded.in_person_fee_kobo,
      updated_at = now();

-- ── the renamed courses ─────────────────────────────────────────────────

create temporary table renamed (old_slug text primary key, new_slug text not null) on commit drop;
insert into renamed values
  ('pc-basics', 'computer-essentials'),
  ('microsoft-office', 'office-essentials');

update public.applications a set course_slug = r.new_slug
  from renamed r where a.course_slug = r.old_slug;
update public.enrolments e set course_slug = r.new_slug
  from renamed r where e.course_slug = r.old_slug;
-- an assessment may not move course (assessment_before_update); this is a
-- rename, not a move
alter table public.assessments disable trigger assessment_before_update;
update public.assessments x set course_slug = r.new_slug
  from renamed r where x.course_slug = r.old_slug;
alter table public.assessments enable trigger assessment_before_update;

-- their modules go with them (course_modules cascades)
delete from public.courses c using renamed r where c.slug = r.old_slug;

-- ── Cybersecurity ───────────────────────────────────────────────────────
-- Dropped with its modules. Nobody has applied for it, enrolled on it or
-- been set work on it; if anyone had, this stops rather than lose them.

do $$
begin
  if exists (select 1 from public.applications where course_slug = 'cybersecurity')
     or exists (select 1 from public.enrolments where course_slug = 'cybersecurity')
     or exists (select 1 from public.assessments where course_slug = 'cybersecurity') then
    raise exception 'Cybersecurity has applications, students or assessments; move them before dropping it';
  end if;
  delete from public.courses where slug = 'cybersecurity';
end;
$$;

-- ── modules ─────────────────────────────────────────────────────────────
-- Replaced whole for the website's courses. Progress is kept by module
-- number (module_progress has no reference to a module row), so nothing
-- else changes.

delete from public.course_modules m using website_courses w where m.course_slug = w.slug;

insert into public.course_modules (course_slug, n, title) values
  ('computer-essentials', 1, 'The machine, and what it is doing'),
  ('computer-essentials', 2, 'Files, folders and where things go'),
  ('computer-essentials', 3, 'Documents, numbers and slides'),
  ('computer-essentials', 4, 'The internet, email and accounts'),
  ('computer-essentials', 5, 'Staying safe, and getting unstuck'),
  ('office-essentials', 1, 'Word, properly'),
  ('office-essentials', 2, 'PowerPoint that carries a decision'),
  ('office-essentials', 3, 'Excel: the data table and its formulas'),
  ('office-essentials', 4, 'Excel: lookups, pivots and reporting'),
  ('office-essentials', 5, 'Access: tables, relationships and queries'),
  ('office-essentials', 6, 'Choosing the right tool, and handing over'),
  ('ai-for-office-use', 1, 'AI fundamentals and prompt engineering'),
  ('ai-for-office-use', 2, 'AI for Microsoft Word and corporate documents'),
  ('ai-for-office-use', 3, 'AI for Microsoft Excel and data analysis'),
  ('ai-for-office-use', 4, 'AI for presentations, productivity and workplace ethics'),
  ('python-programming', 1, 'How programming works'),
  ('python-programming', 2, 'Functions & data structures'),
  ('python-programming', 3, 'Working with files & APIs'),
  ('python-programming', 4, 'Object-oriented Python'),
  ('python-programming', 5, 'Building a project'),
  ('javascript-programming', 1, 'Values and how JavaScript thinks'),
  ('javascript-programming', 2, 'Functions, scope & closures'),
  ('javascript-programming', 3, 'Objects, arrays & the prototype chain'),
  ('javascript-programming', 4, 'Asynchrony & the event loop'),
  ('javascript-programming', 5, 'Modules and the two runtimes'),
  ('javascript-programming', 6, 'Building on both sides'),
  ('frontend-development', 1, 'How the web works'),
  ('frontend-development', 2, 'HTML, structurally'),
  ('frontend-development', 3, 'CSS & layout'),
  ('frontend-development', 4, 'JavaScript foundations'),
  ('frontend-development', 5, 'Building something real'),
  ('backend-development', 1, 'How servers work'),
  ('backend-development', 2, 'Node.js & Express'),
  ('backend-development', 3, 'Databases & data modeling'),
  ('backend-development', 4, 'Authentication & security'),
  ('backend-development', 5, 'Deploying your API'),
  ('web-development-fullstack', 1, 'How the web works'),
  ('web-development-fullstack', 2, 'HTML & structure'),
  ('web-development-fullstack', 3, 'CSS & layout'),
  ('web-development-fullstack', 4, 'JavaScript foundations'),
  ('web-development-fullstack', 5, 'Backend with Node.js'),
  ('web-development-fullstack', 6, 'Fullstack project'),
  ('react-development', 1, 'How React actually works'),
  ('react-development', 2, 'State, placed properly'),
  ('react-development', 3, 'Effects & the outside world'),
  ('react-development', 4, 'Composition & custom hooks'),
  ('react-development', 5, 'Performance, measured'),
  ('react-development', 6, 'Architecture at scale'),
  ('nextjs-fullstack', 1, 'Why a metaframework'),
  ('nextjs-fullstack', 2, 'Routing & layouts'),
  ('nextjs-fullstack', 3, 'Server & client components'),
  ('nextjs-fullstack', 4, 'Data, caching & mutations'),
  ('nextjs-fullstack', 5, 'Auth, databases & APIs'),
  ('nextjs-fullstack', 6, 'Rendering & deployment'),
  ('mobile-development', 1, 'Mobile development foundations'),
  ('mobile-development', 2, 'UI components & navigation'),
  ('mobile-development', 3, 'State & data management'),
  ('mobile-development', 4, 'APIs and backend integration'),
  ('mobile-development', 5, 'Testing & publishing'),
  ('data-analysis', 1, 'Thinking with data'),
  ('data-analysis', 2, 'SQL for analysis'),
  ('data-analysis', 3, 'Python for data'),
  ('data-analysis', 4, 'Visualization & storytelling'),
  ('data-analysis', 5, 'A real analysis project'),
  ('mobile-videography', 1, 'The phone as a camera'),
  ('mobile-videography', 2, 'Light and sound you already have'),
  ('mobile-videography', 3, 'Editing on the phone'),
  ('mobile-videography', 4, 'A short for a real purpose'),
  ('videography-video-editing', 1, 'Camera fundamentals'),
  ('videography-video-editing', 2, 'Lighting & audio'),
  ('videography-video-editing', 3, 'Editing with purpose'),
  ('videography-video-editing', 4, 'Color & finishing'),
  ('videography-video-editing', 5, 'A complete project');
