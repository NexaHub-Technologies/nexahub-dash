-- Invoices kept honest as the console edits them.
--
-- The Fees section lets an admin add an invoice (a second instalment, an
-- extra), change its amount or due date, and void one raised in error. The
-- rules live here, so they hold for every client:
--
--   * an invoice's status follows its balance: paid once payments cover the
--     amount, open otherwise. Raising the amount of a paid invoice reopens
--     it; lowering it to what was paid settles it.
--   * the amount can't drop below what has already been paid.
--   * an invoice with payments can't be voided (the money was received
--     against it), and a voided invoice can't be changed or revived.
--   * an invoice stays with the enrolment it was raised for.
--
--   stateDiagram-v2
--     [*] --> open: raised
--     open --> paid: payments cover the amount
--     paid --> open: amount raised above what was paid
--     open --> void: voided, no payments yet
--     void --> [*]

create function private.invoice_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_paid bigint;
begin
  if new.enrolment_id <> old.enrolment_id then
    raise exception 'An invoice stays with the enrolment it was raised for'
      using errcode = '22023';
  end if;

  if old.status = 'void' then
    raise exception 'That invoice has been voided and can''t be changed'
      using errcode = '23514';
  end if;

  select coalesce(sum(amount_kobo), 0) into v_paid
  from public.payments where invoice_id = new.id;

  if new.status = 'void' then
    if v_paid > 0 then
      raise exception 'An invoice with payments can''t be voided'
        using errcode = '23514',
        hint = 'Change its amount instead, so the balance is right.';
    end if;
    return new;
  end if;

  if new.amount_kobo < v_paid then
    raise exception 'The amount can''t be less than the NGN % already paid',
      to_char(v_paid / 100.0, 'FM999,999,999,990')
      using errcode = '23514';
  end if;

  new.status := case when v_paid >= new.amount_kobo then 'paid' else 'open' end;
  return new;
end;
$$;

create trigger invoice_before_update before update on public.invoices
  for each row execute function private.invoice_before_update();

revoke all on function private.invoice_before_update() from public, anon, authenticated, worker;
