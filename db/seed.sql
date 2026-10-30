-- Local development data, loaded by `bun run db:reset`. Never runs against
-- Neon: there, scripts/bootstrap-admin.ts creates the first admin through
-- Neon Auth so the account can really sign in.

insert into neon_auth."user" (id, name, email, "emailVerified")
values ('a0000000-0000-0000-0000-00000000000a', 'Admin', 'admin@nexahub.test', true);
insert into public.staff (id, full_name, email, role)
values ('a0000000-0000-0000-0000-00000000000a', 'Admin', 'admin@nexahub.test', 'admin');
