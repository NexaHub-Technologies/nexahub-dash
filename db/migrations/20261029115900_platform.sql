-- NexaHub Dash: what the platform must provide before the schema.
--
-- Supabase used to supply the API roles and auth.uid(); on Neon we declare
-- them here. Nothing talks to the database as a table owner except this
-- migration runner. Each client logs in as its own role and is a member of
-- exactly one group role below:
--
--   | login role  | used by                      | group         | how it acts             |
--   |-------------|------------------------------|---------------|-------------------------|
--   | dash_app    | the dashboard's server       | authenticated | set role + staff id     |
--   | website_app | the website's enrol form     | anon          | insert applications     |
--   | worker_app  | the Neon Function "worker"   | worker        | Paystack, notifications |
--
-- Login roles are created outside migrations, because they carry passwords:
-- with SQL as the owner on Neon (create role ... login password ...), or by
-- db/local/setup.sql locally. Never through Neon's Console or API: roles made
-- there are BYPASSRLS members of neon_superuser, which no policy can stop. dash_app joins its groups
-- WITH INHERIT FALSE: holding the connection gives it nothing until a request
-- has been authenticated and the server runs
--
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<staff id>"}', true);
--
-- which is the same shape Supabase's PostgREST used, so every policy written
-- against "authenticated" and the caller's id is unchanged.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'worker') then
    create role worker nologin;
  end if;
end $$;

-- Managed Better Auth keeps its users in neon_auth."user"; staff rows point at
-- them. Fail early and clearly on a branch where Auth was never enabled.
do $$
begin
  if to_regclass('neon_auth."user"') is null then
    raise exception 'neon_auth."user" is missing: enable Neon Auth on this branch (or load db/local/neon_auth_stub.sql locally)'
      using errcode = '55000';
  end if;
end $$;

-- scripts/migrate.ts has already made the schema to record migrations in
create schema if not exists private;
-- policies call the helpers in here as the requesting role, so it needs usage
grant usage on schema private to anon, authenticated, worker;

-- The caller's id, as set by the server after it checked the session. Null
-- for anonymous callers and for the database acting on its own. A setting
-- that was set and then cleared reads as '' rather than null, hence nullif.
create function private.uid() returns uuid
language sql stable set search_path = '' as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
$$;
