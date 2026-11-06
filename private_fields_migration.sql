-- Private fields: personal identifiers are stored encrypted, date of birth is
-- kept to the month, and each person's security settings have a place to live.
--
-- IRD, GST and bank account numbers (business_settings) and the home address
-- (home_loan.address) are encrypted by Fennec's server with a key that isn't in
-- Supabase (see backend/src/services/privateFields.ts). This makes the database
-- refuse any new plain-text value in those columns, so a page or a stolen sign-in
-- can't write one around the server. Values already saved stay as they are until
-- the server starts, when it encrypts them.
--
-- Run this BEFORE deploying the code that goes with it.

begin;

-- 1. Ciphertext is longer than the numbers, so the columns must be plain text.
do $$
declare r record;
begin
  for r in
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and data_type <> 'text'
      and (table_name, column_name) in (('business_settings','ird_number'), ('business_settings','gst_number'),
                                        ('business_settings','bank_account'), ('home_loan','address'))
  loop
    execute format('alter table public.%I alter column %I type text', r.table_name, r.column_name);
  end loop;
end $$;

-- 2. Only encrypted values (or blanks) may be written. Unchanged values are let
--    through, so rows saved before this can still be edited until the server
--    encrypts them.
create or replace function public.require_encrypted_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col text;
  new_v text;
  old_v text;
begin
  foreach col in array tg_argv loop
    new_v := to_jsonb(new) ->> col;
    old_v := case when tg_op = 'UPDATE' then to_jsonb(old) ->> col end;
    if new_v is not null and new_v <> '' and new_v not like 'enc:f1:%' and new_v is distinct from old_v then
      raise exception 'This detail is saved through Fennec so it can be encrypted. Refresh the page and try again.'
        using errcode = '22023';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.require_encrypted_fields() from public, anon, authenticated;

drop trigger if exists business_settings_encrypted_fields on public.business_settings;
create trigger business_settings_encrypted_fields
  before insert or update on public.business_settings
  for each row execute function public.require_encrypted_fields('ird_number', 'gst_number', 'bank_account');

drop trigger if exists home_loan_encrypted_fields on public.home_loan;
create trigger home_loan_encrypted_fields
  before insert or update on public.home_loan
  for each row execute function public.require_encrypted_fields('address');

-- 3. KiwiSaver only needs your age, so keep the month and year of birth, not the day.
update public.fin_kiwisaver
   set date_of_birth = date_trunc('month', date_of_birth)::date
 where date_of_birth is not null and extract(day from date_of_birth) <> 1;

alter table public.fin_kiwisaver drop constraint if exists fin_kiwisaver_birth_month_only;
alter table public.fin_kiwisaver add constraint fin_kiwisaver_birth_month_only
  check (date_of_birth is null or extract(day from date_of_birth) = 1);

-- 4. Security settings each person can ease off (Settings → Security & privacy).
--    Empty means everything on; see frontend/lib/security.ts. Saved by the
--    person's own profile update, like the dashboard layout.
alter table public.profiles add column if not exists security_prefs jsonb not null default '{}'::jsonb;
alter table public.profiles drop constraint if exists profiles_security_prefs_object;
alter table public.profiles add constraint profiles_security_prefs_object
  check (jsonb_typeof(security_prefs) = 'object' and pg_column_size(security_prefs) < 2000);

commit;

-- Check: how many saved details are still waiting for the server to encrypt them
-- (this drops to 0 once the new server code has started).
select 'business_settings' as table_name,
       count(*) filter (where ird_number   <> '' and ird_number   not like 'enc:f1:%')
     + count(*) filter (where gst_number   <> '' and gst_number   not like 'enc:f1:%')
     + count(*) filter (where bank_account <> '' and bank_account not like 'enc:f1:%') as plain_text_left
  from public.business_settings
union all
select 'home_loan', count(*) filter (where address <> '' and address not like 'enc:f1:%') from public.home_loan
union all
select 'fin_kiwisaver (full birth dates)', count(*) filter (where extract(day from date_of_birth) <> 1) from public.fin_kiwisaver;
