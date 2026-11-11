-- Deleting a student from the registry.
--
-- For someone entered by mistake or approved in error. Their enrolments,
-- unpaid invoices, assigned work and uploads, queued messages and portal
-- login all go with them. Their application stays, as the record of who
-- applied, and so does the audit log.
--
-- A student with a payment on record is refused: money that was received
-- must stay on the books. Such a student is withdrawn instead, which keeps
-- everything.
--
-- An invoice blocks the deletion of its enrolment on purpose (on delete
-- restrict), and admins have no right to delete invoices by hand, so this
-- is the one place it happens, and only for invoices nobody paid towards.
--
-- Returns the storage keys of the student's uploaded files, so the server
-- can delete the files themselves.

create function public.delete_student(p_student uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_student public.students;
  v_keys text[];
begin
  if not private.is_admin() then
    raise exception 'Only an admin can delete a student' using errcode = '42501';
  end if;
  select * into v_student from public.students where id = p_student for update;
  if not found then
    raise exception 'No such student' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.payments p
    join public.invoices i on i.id = p.invoice_id
    join public.enrolments e on e.id = i.enrolment_id
    where e.student_id = p_student
  ) then
    raise exception '% has payments on record and can''t be deleted. Set their status to Withdrawn instead.',
      v_student.full_name using errcode = '23514';
  end if;

  select coalesce(array_agg(f.storage_key), '{}') into v_keys
  from public.submission_files f
  join public.assignments g on g.id = f.assignment_id
  join public.enrolments e on e.id = g.enrolment_id
  where e.student_id = p_student;

  delete from public.invoices i using public.enrolments e
  where i.enrolment_id = e.id and e.student_id = p_student;
  delete from public.students where id = p_student;

  -- their login, unless the same person is also on staff
  if v_student.auth_user_id is not null
     and not exists (select 1 from public.staff where id = v_student.auth_user_id) then
    delete from neon_auth."user" where id = v_student.auth_user_id;
  end if;

  insert into public.audit_log (action, table_name, row_id, detail)
  values ('delete_student', 'students', p_student::text,
          jsonb_build_object('full_name', v_student.full_name, 'email', v_student.email));
  return v_keys;
end;
$$;

revoke all on function public.delete_student(uuid) from public, anon;
grant execute on function public.delete_student(uuid) to authenticated;
