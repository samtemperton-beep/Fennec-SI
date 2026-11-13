-- Finance → Rental: a property's loan account. Fennec reads it for the live
-- loan balance and the interest the bank actually charged, without moving the
-- account out of household pages (so Home Loan keeps working and repayments
-- aren't counted twice). Run AFTER rental_migration.sql. Safe to run again.

begin;

alter table public.rental_properties add column if not exists loan_account_id uuid
  references public.fin_accounts(id) on delete set null;

-- Only the person's own account can be chosen.
create or replace function public.rental_properties_loan_check()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.loan_account_id is not null and not exists (
    select 1 from public.fin_accounts a where a.id = new.loan_account_id and a.user_id = new.user_id
  ) then
    raise exception 'That account isn''t yours';
  end if;
  return new;
end;
$$;
revoke all on function public.rental_properties_loan_check() from public, anon, authenticated;
drop trigger if exists rental_properties_loan_check on public.rental_properties;
create trigger rental_properties_loan_check
  before insert or update of loan_account_id on public.rental_properties
  for each row execute function public.rental_properties_loan_check();

commit;

-- Check: should return 1.
select count(*) as loan_account_column from information_schema.columns
where table_name = 'rental_properties' and column_name = 'loan_account_id';
