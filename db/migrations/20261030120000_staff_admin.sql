-- Managing staff: inviting someone, changing their role, deactivating them.
--
-- An invitation is one transaction: a Neon Auth user (so a magic link can
-- sign them in, with public sign-up switched off) and their staff row. Doing
-- it here rather than through the Neon API keeps an account-wide API key out
-- of the dashboard, and the admin check next to the write it guards.
--
--   sequenceDiagram
--     actor Admin
--     participant fn as invite_staff()
--     participant auth as neon_auth."user"
--     participant staff as public.staff
--     participant trg as audit trigger
--     Admin->>fn: email, name, role
--     fn->>fn: caller is an active admin? (else 42501)
--     fn->>auth: insert (or reuse the existing auth user for that email)
--     fn->>staff: insert, unless already on staff (else 23514)
--     staff->>trg: audit_log row, actor = the admin
--
-- Role changes and deactivation are plain updates on staff, allowed to admins
-- by RLS. staff_guard stops an admin from demoting or deactivating themselves,
-- so the school can never be left without someone able to manage staff by
-- accident. Deactivation takes effect on that person's next request.

create function public.invite_staff(
  p_email text,
  p_full_name text,
  p_role public.staff_role default 'instructor'
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_name text := trim(p_full_name);
  v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Only an admin can invite staff' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$' then
    raise exception 'That email address doesn''t look right' using errcode = '22023';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'A name is needed (up to 120 characters)' using errcode = '22023';
  end if;
  if exists (select 1 from public.staff where lower(email) = v_email) then
    raise exception '% is already on staff', v_email using errcode = '23514';
  end if;

  insert into neon_auth."user" (name, email, "emailVerified")
  values (v_name, v_email, true)
  on conflict (email) do update set name = excluded.name
  returning id into v_id;

  insert into public.staff (id, full_name, email, role)
  values (v_id, v_name, v_email, p_role);
  return v_id;
end;
$$;

revoke all on function public.invite_staff(text, text, public.staff_role) from public, anon;
grant execute on function public.invite_staff(text, text, public.staff_role) to authenticated;

create function private.staff_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.id = private.uid() and (not new.active or new.role <> 'admin') then
    raise exception 'You can''t remove your own admin access; ask another admin'
      using errcode = '23514';
  end if;
  if new.email <> old.email then
    raise exception 'A staff email can''t be changed; invite the new address instead'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger staff_guard before update on public.staff
  for each row execute function private.staff_guard();

revoke all on function private.staff_guard() from public, anon, authenticated, worker;
