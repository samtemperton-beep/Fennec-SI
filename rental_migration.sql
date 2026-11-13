-- Rental properties (Finance → Rental).
-- - rental_properties: each property someone owns as a rental, with the
--   figures Fennec can't read from a bank (value, loan, expected rent).
-- - fin_accounts.rental_property_id: accounts used for a property. Their
--   transactions are kept out of the household budget and spending, like
--   business accounts, and use their own 'rental' categories.
-- - Auto-categorising only uses a rule when its category belongs to the same
--   kind of account (household, business or rental), and the shared merchant
--   list never touches rental accounts.
-- - notification_prefs.rental_alerts: "rent hasn't arrived" notifications.
-- Run once in the Supabase SQL Editor. Safe to run again.

begin;

-- 1. Properties.
create table if not exists public.rental_properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  value numeric(14,2) check (value is null or value >= 0),
  value_note text check (value_note is null or length(value_note) <= 60),
  purchase_price numeric(14,2) check (purchase_price is null or purchase_price >= 0),
  purchase_date date,
  loan_balance numeric(14,2) check (loan_balance is null or loan_balance >= 0),
  interest_rate numeric(6,3) check (interest_rate is null or (interest_rate >= 0 and interest_rate <= 30)),
  rent_amount numeric(12,2) check (rent_amount is null or rent_amount >= 0),
  rent_frequency text not null default 'weekly' check (rent_frequency in ('weekly', 'fortnightly', 'monthly')),
  ownership_pct numeric(5,2) not null default 100 check (ownership_pct > 0 and ownership_pct <= 100),
  new_build boolean not null default false,
  interest_by_year jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rental_properties_user_idx on public.rental_properties(user_id);
alter table public.rental_properties enable row level security;
revoke all on public.rental_properties from anon;
grant select, insert, update, delete on public.rental_properties to authenticated;
drop policy if exists "People manage their own rentals" on public.rental_properties;
create policy "People manage their own rentals" on public.rental_properties
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "require 2fa when enrolled" on public.rental_properties;
create policy "require 2fa when enrolled" on public.rental_properties
  as restrictive for all to authenticated using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- 2. Accounts used for a property.
alter table public.fin_accounts add column if not exists is_rental boolean not null default false;
alter table public.fin_accounts add column if not exists rental_property_id uuid
  references public.rental_properties(id) on delete set null;
create index if not exists fin_accounts_rental_idx on public.fin_accounts(rental_property_id) where rental_property_id is not null;

-- An account can only be linked to the person's own property, and is_rental
-- always matches whether it's linked.
create or replace function public.fin_accounts_rental_check()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.rental_property_id is not null and not exists (
    select 1 from public.rental_properties p where p.id = new.rental_property_id and p.user_id = new.user_id
  ) then
    raise exception 'That property isn''t yours';
  end if;
  new.is_rental := new.rental_property_id is not null;
  return new;
end;
$$;
revoke all on function public.fin_accounts_rental_check() from public, anon, authenticated;
drop trigger if exists fin_accounts_rental_check on public.fin_accounts;
create trigger fin_accounts_rental_check
  before insert or update of rental_property_id on public.fin_accounts
  for each row execute function public.fin_accounts_rental_check();

-- 3. Rental categories.
do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.fin_categories'::regclass and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%scope%'
  loop
    execute format('alter table public.fin_categories drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.fin_categories add constraint fin_categories_scope_check
  check (scope in ('household', 'business', 'rental'));

-- 4. Auto-categorising, aware of the kind of account.
do $$
declare
  rule_col text := (
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_category_rules' and column_name in ('keyword', 'pattern')
    order by column_name limit 1
  );
begin
  execute format($f$
    create or replace function public.fin_apply_category_rule()
    returns trigger language plpgsql as $body$
    declare
      biz boolean;
      rental boolean;
      acct_scope text;
      match_id uuid;
      cat_id uuid;
    begin
      if new.category_id is not null then
        return new;
      end if;

      select coalesce(is_business, false), coalesce(is_rental, false) into biz, rental
      from public.fin_accounts where id = new.account_id;
      acct_scope := case when rental then 'rental' when biz then 'business' else 'household' end;

      select r.category_id into new.category_id
      from public.fin_category_rules r
      join public.fin_categories c on c.id = r.category_id and c.scope = acct_scope
      where r.user_id = new.user_id
        and new.description ilike '%%' || r.%1$I || '%%'
      order by length(r.%1$I) desc
      limit 1;
      if new.category_id is not null then
        new.category_source := 'rule';
        return new;
      end if;

      if acct_scope = 'rental' then
        return new;
      end if;

      select s.id, c.id into match_id, cat_id
      from public.shared_category_matches s
      join public.fin_categories c
        on c.user_id = new.user_id and c.name = s.category_name and c.scope = s.scope
      where s.status = 'approved'
        and s.scope = acct_scope
        and new.description ilike '%%' || s.keyword || '%%'
        and not exists (select 1 from public.fin_category_optouts o where o.user_id = new.user_id and o.match_id = s.id)
      order by length(s.keyword) desc
      limit 1;
      if match_id is not null then
        new.category_id := cat_id;
        new.category_source := 'shared';
        new.shared_match_id := match_id;
      end if;
      return new;
    end;
    $body$
  $f$, rule_col);
end $$;

-- The shared list, applied to past transactions, skips rental accounts too.
create or replace function public.apply_shared_match(target uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.fin_transactions t
     set category_id = c.id, category_source = 'shared', shared_match_id = s.id
    from public.shared_category_matches s, public.fin_accounts a, public.fin_categories c
   where s.id = target
     and s.status = 'approved'
     and a.id = t.account_id
     and not coalesce(a.is_rental, false)
     and s.scope = case when a.is_business then 'business' else 'household' end
     and c.user_id = t.user_id and c.name = s.category_name and c.scope = s.scope
     and t.category_id is null
     and t.description ilike '%' || s.keyword || '%'
     and not exists (select 1 from public.fin_category_optouts o where o.user_id = t.user_id and o.match_id = s.id);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.apply_shared_match(uuid) from public, anon, authenticated;

-- 5. Notifications.
alter table public.notification_prefs add column if not exists rental_alerts boolean not null default true;

commit;

-- Check: rls_on should be true, and the last two should each return 1.
select relname, relrowsecurity as rls_on from pg_class where relname = 'rental_properties';
select count(*) as scope_check from pg_constraint where conname = 'fin_categories_scope_check';
select count(*) as rental_alerts from information_schema.columns where table_name = 'notification_prefs' and column_name = 'rental_alerts';
