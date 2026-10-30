-- Which login role acts as which group role (see 20261029115900_platform.sql).
-- Run by scripts/migrate.ts after the migrations, on every database. It is
-- idempotent and skips a login role that this database doesn't have yet.

do $$
begin
  -- The dashboard holds no rights of its own: INHERIT FALSE means it must
  -- "set role authenticated" (or anon) per transaction, after its server has
  -- checked who is asking.
  if exists (select 1 from pg_roles where rolname = 'dash_app') then
    grant authenticated, anon to dash_app with inherit false, set true;
  end if;
  if exists (select 1 from pg_roles where rolname = 'website_app') then
    grant anon to website_app with inherit true;
  end if;
  if exists (select 1 from pg_roles where rolname = 'worker_app') then
    grant worker to worker_app with inherit true;
  end if;
end $$;
