-- Sign-in moves from magic links to email and password, and the dashboard
-- has a single admin account for now, so the pieces built for emailing links
-- and inviting staff go. Neon Auth checks the password; the dashboard still
-- lets someone in only while they have an active staff row.
--
-- The admin's password is set by scripts/bootstrap-admin.ts, which stores a
-- Better Auth hash in neon_auth.account. staff_guard stays: even a sole admin
-- must not be able to deactivate or demote themselves by mistake.

drop function public.invite_staff(text, text, public.staff_role);
drop function public.can_sign_in(text);
