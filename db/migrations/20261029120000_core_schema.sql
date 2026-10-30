-- NexaHub Dash: core schema.
--
-- The database is the backend. Who may read or write what is row-level
-- security; rules that must hold whatever the caller does are constraints and
-- triggers; multi-step operations are SQL functions the server calls. The
-- Neon Function "worker" exists only where a secret is needed (Paystack,
-- Resend, Termii).
--
-- Roles are read live from public.staff, never from JWT claims, so removing or
-- demoting a member of staff takes effect on their very next request rather
-- than when their token refreshes.
--
-- Who can do what:
--
--   | table               | anon        | instructor                    | admin |
--   |---------------------|-------------|-------------------------------|-------|
--   | applications        | insert only | —                             | all   |
--   | staff, courses      | —           | read                          | all   |
--   | cohorts, enrolments | —           | read own cohorts              | all   |
--   | students, prefs     | —           | read students in own cohorts  | all   |
--   | sessions            | —           | read/write own cohorts        | all   |
--   | attendance          | —           | read/write own cohorts        | all   |
--   | module_progress     | —           | read/write own cohorts        | all   |
--   | invoices, payments  | —           | —                             | all   |
--   | notifications, log  | —           | —                             | read  |
--
-- Money is integer kobo. Times are timestamptz; schedules are laid out in
-- Africa/Lagos (WAT, UTC+1, no daylight saving).

-- ── enums ───────────────────────────────────────────────────────────────

create type public.staff_role as enum ('admin', 'instructor');
create type public.application_status as enum ('new', 'approved', 'declined');
create type public.training_mode as enum ('online', 'in_person', 'hybrid');
create type public.enrolment_status as enum ('active', 'completed', 'withdrawn');
create type public.attendance_status as enum ('present', 'late', 'absent', 'excused');
create type public.progress_status as enum ('not_started', 'in_progress', 'done');
create type public.invoice_status as enum ('open', 'paid', 'void');
create type public.payment_method as enum ('paystack', 'transfer', 'cash');
create type public.channel as enum ('email', 'sms');
create type public.notification_status as enum ('queued', 'sending', 'sent', 'failed', 'skipped');

-- ── tables ──────────────────────────────────────────────────────────────

create table public.staff (
  id uuid primary key references neon_auth."user" (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text not null unique,
  role public.staff_role not null default 'instructor',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- the curriculum is defined on the website (src/lib/courses.ts) and synced here
create table public.courses (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  default_fee_kobo bigint not null default 0 check (default_fee_kobo >= 0),
  updated_at timestamptz not null default now()
);

create table public.course_modules (
  course_slug text not null references public.courses (slug) on delete cascade,
  n smallint not null check (n > 0),
  title text not null,
  primary key (course_slug, n)
);

create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  course_slug text not null references public.courses (slug),
  name text not null check (char_length(name) between 1 and 120),
  starts_on date not null,
  ends_on date not null,
  mode public.training_mode not null,
  instructor_id uuid references public.staff (id) on delete set null,
  fee_kobo bigint not null check (fee_kobo >= 0),
  -- the weekly pattern generate_sessions() lays out: ISO weekdays, 1 = Monday
  meeting_days smallint[] not null default '{}'
    check (meeting_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  meeting_time time,
  meeting_minutes integer not null default 120 check (meeting_minutes between 15 and 600),
  location text,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

-- Written by the website's enrol form with the anon key, so every rule a
-- direct POST could break is a constraint here: the browser's checks and the
-- website's server-side validate() are not the last line.
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  course_slug text not null references public.courses (slug),
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text not null
    check (char_length(email) <= 320 and email ~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$'),
  phone text not null check (char_length(phone) between 5 and 40),
  gender text not null check (char_length(gender) <= 40),
  employment text not null check (char_length(employment) <= 40),
  -- the website's own wording ("Online training", …), kept as submitted
  mode text not null check (char_length(mode) <= 60),
  has_experience boolean not null,
  experience_detail text not null default '' check (char_length(experience_detail) <= 2000),
  has_laptop boolean not null,
  heard_from text not null check (char_length(heard_from) <= 60),
  can_commit boolean not null,
  comments text not null default '' check (char_length(comments) <= 2000),
  -- consent to class and payment messages by email and SMS (NDPA)
  notify_consent boolean not null,
  status public.application_status not null default 'new',
  reviewed_by uuid references public.staff (id),
  reviewed_at timestamptz,
  decline_reason text check (char_length(decline_reason) <= 500),
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text not null
    check (char_length(email) <= 320 and email ~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$'),
  phone text check (char_length(phone) between 5 and 40),
  gender text,
  employment text,
  application_id uuid unique references public.applications (id) on delete set null,
  created_at timestamptz not null default now()
);
-- one student per address, however it was capitalised
create unique index students_email_key on public.students (lower(email));

create table public.enrolments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  status public.enrolment_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (student_id, cohort_id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  module_n smallint check (module_n > 0),
  location text,
  cancelled boolean not null default false,
  check (ends_at > starts_at),
  unique (cohort_id, starts_at)
);

create table public.attendance (
  session_id uuid not null references public.sessions (id) on delete cascade,
  enrolment_id uuid not null references public.enrolments (id) on delete cascade,
  status public.attendance_status not null,
  note text check (char_length(note) <= 500),
  marked_by uuid references public.staff (id),
  marked_at timestamptz not null default now(),
  primary key (session_id, enrolment_id)
);

create table public.module_progress (
  enrolment_id uuid not null references public.enrolments (id) on delete cascade,
  module_n smallint not null check (module_n > 0),
  status public.progress_status not null default 'not_started',
  score smallint check (score between 0 and 100),
  updated_by uuid references public.staff (id),
  updated_at timestamptz not null default now(),
  primary key (enrolment_id, module_n)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null references public.enrolments (id) on delete restrict,
  description text not null check (char_length(description) between 1 and 200),
  amount_kobo bigint not null check (amount_kobo > 0),
  due_on date not null,
  status public.invoice_status not null default 'open',
  paystack_reference text unique,
  pay_url text,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo > 0),
  method public.payment_method not null,
  -- Paystack's reference, or the bank/receipt reference for a manual entry.
  -- Unique, so a webhook delivered twice records the payment once.
  reference text not null unique check (char_length(reference) between 1 and 120),
  paid_at timestamptz not null default now(),
  recorded_by uuid references public.staff (id),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

-- The outbox. Nothing sends a message directly: rows are queued here, and the
-- worker Neon Function drains them. dedupe_key makes every
-- enqueue idempotent, so a retried trigger or a cron run that overlaps the
-- last one cannot send the same message twice.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students (id) on delete cascade,
  staff_id uuid references public.staff (id) on delete cascade,
  channel public.channel not null,
  template text not null,
  data jsonb not null default '{}',
  send_after timestamptz not null default now(),
  status public.notification_status not null default 'queued',
  attempts smallint not null default 0,
  last_error text,
  dedupe_key text not null unique,
  provider_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(student_id, staff_id) = 1)
);
create index notifications_due on public.notifications (send_after) where status = 'queued';

create table public.notification_prefs (
  student_id uuid primary key references public.students (id) on delete cascade,
  email boolean not null default true,
  sms boolean not null default true,
  updated_at timestamptz not null default now()
);

-- append-only; written only by definer functions and triggers
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid default private.uid(),
  action text not null,
  table_name text,
  row_id text,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);

create view public.invoice_balances with (security_invoker = true) as
select
  i.id as invoice_id,
  i.enrolment_id,
  i.amount_kobo,
  coalesce(sum(p.amount_kobo), 0)::bigint as paid_kobo,
  (i.amount_kobo - coalesce(sum(p.amount_kobo), 0))::bigint as balance_kobo,
  i.due_on,
  i.status
from public.invoices i
left join public.payments p on p.invoice_id = i.id
group by i.id;

-- ── who is asking ───────────────────────────────────────────────────────
-- SECURITY DEFINER so policies on staff can call them without recursing;
-- STABLE so they run once per statement, not per row.

create function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where id = private.uid() and active);
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where id = private.uid() and active and role = 'admin');
$$;

create function private.teaches(p_cohort uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cohorts c
    join public.staff s on s.id = c.instructor_id
    where c.id = p_cohort and s.id = private.uid() and s.active
  );
$$;

create function private.teaches_session(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.teaches((select cohort_id from public.sessions where id = p_session));
$$;

create function private.teaches_enrolment(p_enrolment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.teaches((select cohort_id from public.enrolments where id = p_enrolment));
$$;

create function private.teaches_student(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrolments e
    where e.student_id = p_student and private.teaches(e.cohort_id)
  );
$$;

-- ── grants, then row-level security ─────────────────────────────────────
-- Group roles start with no privileges (20261029115900_platform.sql), so each
-- grant below is deliberate. RLS then narrows the rows.

grant select, insert, update, delete on
  public.staff, public.courses, public.course_modules, public.cohorts,
  public.applications, public.students, public.enrolments, public.sessions,
  public.attendance, public.module_progress, public.invoices, public.payments,
  public.notification_prefs
  to authenticated;
grant select on public.notifications, public.audit_log, public.invoice_balances to authenticated;
-- the worker checks a Paystack charge against its invoice, then records it
grant select on public.invoices, public.invoice_balances to worker;
grant insert on public.payments to worker;

-- the website may only create an application, and only with these columns —
-- status and review fields are not even insertable
grant insert (
  course_slug, full_name, email, phone, gender, employment, mode,
  has_experience, experience_detail, has_laptop, heard_from, can_commit,
  comments, notify_consent
) on public.applications to anon;

alter table public.staff enable row level security;
alter table public.courses enable row level security;
alter table public.course_modules enable row level security;
alter table public.cohorts enable row level security;
alter table public.applications enable row level security;
alter table public.students enable row level security;
alter table public.enrolments enable row level security;
alter table public.sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.module_progress enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.audit_log enable row level security;

-- staff: everyone on staff sees the team; only admins change it
create policy staff_select on public.staff for select to authenticated
  using (private.is_staff());
create policy staff_admin_write on public.staff for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- curriculum: read by staff, maintained by admins (and the website sync)
create policy courses_select on public.courses for select to authenticated
  using (private.is_staff());
create policy courses_admin_write on public.courses for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy modules_select on public.course_modules for select to authenticated
  using (private.is_staff());
create policy modules_admin_write on public.course_modules for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- cohorts: an instructor sees the cohorts they teach
create policy cohorts_select on public.cohorts for select to authenticated
  using (private.is_admin() or private.teaches(id));
create policy cohorts_admin_write on public.cohorts for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- applications: the public can submit and never read back; admins review
create policy applications_insert_public on public.applications for insert to anon, authenticated
  with check (status = 'new' and reviewed_by is null and reviewed_at is null);
create policy applications_admin on public.applications for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- students and their message preferences: visible to whoever teaches them
create policy students_select on public.students for select to authenticated
  using (private.is_admin() or private.teaches_student(id));
create policy students_admin_write on public.students for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy prefs_select on public.notification_prefs for select to authenticated
  using (private.is_admin() or private.teaches_student(student_id));
create policy prefs_admin_write on public.notification_prefs for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy enrolments_select on public.enrolments for select to authenticated
  using (private.is_admin() or private.teaches(cohort_id));
create policy enrolments_admin_write on public.enrolments for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- sessions: instructors may add, move or cancel their own cohort's classes
create policy sessions_select on public.sessions for select to authenticated
  using (private.is_admin() or private.teaches(cohort_id));
create policy sessions_insert on public.sessions for insert to authenticated
  with check (private.is_admin() or private.teaches(cohort_id));
create policy sessions_update on public.sessions for update to authenticated
  using (private.is_admin() or private.teaches(cohort_id))
  with check (private.is_admin() or private.teaches(cohort_id));
create policy sessions_admin_delete on public.sessions for delete to authenticated
  using (private.is_admin());

create policy attendance_select on public.attendance for select to authenticated
  using (private.is_admin() or private.teaches_session(session_id));
create policy attendance_insert on public.attendance for insert to authenticated
  with check (private.is_admin() or private.teaches_session(session_id));
create policy attendance_update on public.attendance for update to authenticated
  using (private.is_admin() or private.teaches_session(session_id))
  with check (private.is_admin() or private.teaches_session(session_id));
create policy attendance_admin_delete on public.attendance for delete to authenticated
  using (private.is_admin());

create policy progress_select on public.module_progress for select to authenticated
  using (private.is_admin() or private.teaches_enrolment(enrolment_id));
create policy progress_insert on public.module_progress for insert to authenticated
  with check (private.is_admin() or private.teaches_enrolment(enrolment_id));
create policy progress_update on public.module_progress for update to authenticated
  using (private.is_admin() or private.teaches_enrolment(enrolment_id))
  with check (private.is_admin() or private.teaches_enrolment(enrolment_id));

-- fees are admin business only; invoices are voided, never deleted
create policy invoices_admin_select on public.invoices for select to authenticated
  using (private.is_admin());
create policy invoices_admin_insert on public.invoices for insert to authenticated
  with check (private.is_admin());
create policy invoices_admin_update on public.invoices for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- an admin records transfers and cash as themselves; Paystack payments arrive
-- through the worker, and only as Paystack payments
create policy payments_admin_select on public.payments for select to authenticated
  using (private.is_admin());
create policy payments_admin_insert on public.payments for insert to authenticated
  with check (
    private.is_admin() and method in ('transfer', 'cash') and recorded_by = private.uid()
  );
create policy payments_worker_select on public.payments for select to worker
  using (method = 'paystack');
create policy payments_worker_insert on public.payments for insert to worker
  with check (method = 'paystack' and recorded_by is null);
create policy invoices_worker_select on public.invoices for select to worker
  using (true);

-- server-only tables: readable by admins, written only by definer functions
create policy notifications_admin_select on public.notifications for select to authenticated
  using (private.is_admin());
create policy audit_admin_select on public.audit_log for select to authenticated
  using (private.is_admin());

-- helpers are executable by signed-in users (policies need them) and nobody else
revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, worker;
