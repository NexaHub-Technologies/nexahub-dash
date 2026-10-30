-- Local and CI only: what a Neon branch already has before the first migration.
-- Never run this against Neon. There, Auth creates neon_auth itself and the
-- login roles are created in the Console or API so their passwords stay there.

-- The slice of Managed Better Auth's user table that the schema relies on,
-- with the column names Better Auth uses.
create schema if not exists neon_auth;
create table if not exists neon_auth."user" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null default false,
  image text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'dash_app') then
    create role dash_app login password 'dash_app';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'website_app') then
    create role website_app login password 'website_app';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'worker_app') then
    create role worker_app login password 'worker_app';
  end if;
end $$;
