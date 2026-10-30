-- Whether an address may be sent a sign-in link. Better Auth emails a magic
-- link to any address and only refuses a stranger when the link is opened, so
-- the dashboard asks first and sends nothing to anyone who isn't active staff.
-- The login form answers the same either way; only the server sees this.

create function public.can_sign_in(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff
    where lower(email) = lower(trim(p_email)) and active
  );
$$;

revoke all on function public.can_sign_in(text) from public;
grant execute on function public.can_sign_in(text) to anon;
