-- ── One owner for every finance row ──────────────────────────────────────────
-- Run in the Fennec SI Supabase SQL editor (project: vgvcyopwmczkrpkvarpy).
-- Safe to re-run. It keeps all existing data: every row goes to the household's
-- "me" member, and nothing is deleted.
--
-- Finance was built for one household. "owner" only says me/partner/joint, so
-- "joint" rows were readable by every signed-in user, categories were shared by
-- everyone, and anyone outside household_members couldn't use Finance at all.
--
-- After this:
--   - Every row has a user_id, and people see their own rows.
--   - joint/partner rows are also shared with the other household member, and
--     only if both people are in household_members.
--   - Every user has their own categories and rules. New users get a default set.
--   - delete_user_data() and disconnect_akahu() can only be called by the backend.

begin;

-- 1. Who owns the existing data.
do $$
begin
  if (select count(*) from public.household_members where role = 'me') <> 1 then
    raise exception 'Expected exactly one household member with role me. Nothing was changed.';
  end if;
end $$;

-- 2. Add user_id everywhere and fill it in.
do $$
declare
  t text;
  owner_id uuid := (select user_id from public.household_members where role = 'me');
begin
  foreach t in array array['fin_accounts', 'fin_bills', 'fin_goals', 'fin_categories', 'fin_category_rules', 'fin_transactions'] loop
    execute format('alter table public.%I add column if not exists user_id uuid references auth.users(id) on delete cascade', t);
    execute format('alter table public.%I alter column user_id set default auth.uid()', t);
  end loop;

  update public.fin_accounts set user_id = owner_id where user_id is null;
  update public.fin_bills set user_id = owner_id where user_id is null;
  update public.fin_goals set user_id = owner_id where user_id is null;
  update public.fin_categories set user_id = owner_id where user_id is null;
  update public.fin_category_rules set user_id = owner_id where user_id is null;
  update public.fin_transactions t set user_id = a.user_id
    from public.fin_accounts a where a.id = t.account_id and t.user_id is null;

  foreach t in array array['fin_accounts', 'fin_bills', 'fin_goals', 'fin_categories', 'fin_category_rules', 'fin_transactions'] loop
    execute format('alter table public.%I alter column user_id set not null', t);
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id_idx', t);
  end loop;
end $$;

-- 3. Names only need to be unique per user now.
do $$
declare
  c record;
  rule_col text := (
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_category_rules' and column_name in ('keyword', 'pattern')
    order by column_name limit 1
  );
begin
  for c in
    select con.conrelid::regclass as tbl, con.conname
    from pg_constraint con
    where con.contype = 'u'
      and con.conrelid in ('public.fin_categories'::regclass, 'public.fin_category_rules'::regclass)
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;

  alter table public.fin_categories add constraint fin_categories_user_name_scope_key unique (user_id, name, scope);
  execute format('alter table public.fin_category_rules add constraint fin_category_rules_user_key unique (user_id, %I)', rule_col);

  -- Auto-categorise from the transaction owner's rules, never someone else's.
  execute format($f$
    create or replace function public.fin_apply_category_rule()
    returns trigger language plpgsql as $body$
    begin
      if new.category_id is null then
        select category_id into new.category_id
        from public.fin_category_rules
        where user_id = new.user_id
          and new.description ilike '%%' || %1$I || '%%'
        order by length(%1$I) desc
        limit 1;
      end if;
      return new;
    end;
    $body$
  $f$, rule_col);
end $$;

-- 4. Household sharing. True only when both people are in household_members.
create or replace function public.shares_household(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.household_members where user_id = auth.uid())
     and exists (select 1 from public.household_members where user_id = other);
$$;
revoke all on function public.shares_household(uuid) from public;
grant execute on function public.shares_household(uuid) to authenticated;

-- 5. Replace every permissive rule. The 2FA rule is restrictive and stays.
do $$
declare
  p record;
  t text;
  rule constant text := '(user_id = auth.uid() or ((owner = ''joint'' or owner = public.current_household_role()) and public.shares_household(user_id)))';
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and permissive = 'PERMISSIVE'
      and tablename in ('fin_accounts', 'fin_bills', 'fin_goals', 'fin_categories', 'fin_category_rules', 'fin_transactions', 'fin_goal_contributions')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;

  foreach t in array array['fin_accounts', 'fin_bills', 'fin_goals'] loop
    execute format('create policy %I on public.%I for all to authenticated using %s with check %s', t || '_owner', t, rule, rule);
  end loop;

  foreach t in array array['fin_categories', 'fin_category_rules'] loop
    execute format('create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_owner', t);
  end loop;

  -- These two follow their parent row, whose own rule applies inside the check.
  create policy fin_transactions_owner on public.fin_transactions for all to authenticated
    using (exists (select 1 from public.fin_accounts a where a.id = account_id))
    with check (exists (select 1 from public.fin_accounts a where a.id = account_id));
  create policy fin_goal_contributions_owner on public.fin_goal_contributions for all to authenticated
    using (exists (select 1 from public.fin_goals g where g.id = goal_id))
    with check (exists (select 1 from public.fin_goals g where g.id = goal_id));
end $$;

-- 6. Default categories for each user.
create or replace function public.seed_fin_categories(target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.fin_categories (user_id, name, scope)
  select target, c.name, c.scope
  from (values
    ('Groceries', 'household'), ('Rent/Mortgage', 'household'), ('Utilities', 'household'),
    ('Transport', 'household'), ('Dining Out', 'household'), ('Entertainment', 'household'),
    ('Subscriptions', 'household'), ('Health & Wellness', 'household'), ('Shopping', 'household'),
    ('Insurance', 'household'), ('Savings', 'household'), ('Income', 'household'),
    ('Miscellaneous', 'household'),
    ('Sales', 'business'), ('Materials', 'business'), ('Subcontractors', 'business'),
    ('Vehicle', 'business'), ('Tools & Equipment', 'business'), ('Software', 'business'),
    ('Office', 'business'), ('Insurance', 'business'), ('Accounting', 'business'),
    ('Tax', 'business'), ('Drawings', 'business'), ('Miscellaneous', 'business')
  ) as c(name, scope)
  on conflict (user_id, name, scope) do nothing;
$$;
revoke all on function public.seed_fin_categories(uuid) from public, anon, authenticated;

create or replace function public.seed_fin_categories_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_fin_categories(new.id);
  return new;
end;
$$;
revoke all on function public.seed_fin_categories_on_signup() from public, anon, authenticated;

drop trigger if exists seed_fin_categories_on_signup on auth.users;
create trigger seed_fin_categories_on_signup
  after insert on auth.users
  for each row execute function public.seed_fin_categories_on_signup();

-- Existing users who have none. The household keeps the categories it has.
select public.seed_fin_categories(u.id)
from auth.users u
where not exists (select 1 from public.fin_categories c where c.user_id = u.id);

-- 7. Whether a user's Akahu connection needs attention. The backend writes it.
create table if not exists public.akahu_connection_status (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  problem    text not null check (problem in ('tokens', 'connection')),
  detail     text,
  updated_at timestamptz not null default now()
);
alter table public.akahu_connection_status enable row level security;
drop policy if exists "users read own akahu connection" on public.akahu_connection_status;
create policy "users read own akahu connection" on public.akahu_connection_status
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "require 2fa when enrolled" on public.akahu_connection_status;
create policy "require 2fa when enrolled" on public.akahu_connection_status as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- 8. Disconnect Akahu: remove the tokens and what they synced. Manual holdings,
--    KiwiSaver settings, bills, goals and net worth totals stay.
create or replace function public.disconnect_akahu(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.akahu_credentials where user_id = target;
  delete from public.akahu_connection_status where user_id = target;
  delete from public.akahu_sync_status where user_id = target;
  delete from public.fin_accounts where user_id = target and akahu_account_id is not null;
  delete from public.holdings where user_id = target and source = 'akahu';
  delete from public.balance_snapshots where user_id = target;
  delete from public.portfolio_verifications where user_id = target;
  update public.fin_kiwisaver
    set akahu_account_id = null, akahu_returns = null, akahu_synced_at = null, current_balance = 0
    where user_id = target and akahu_account_id is not null;
end;
$$;
revoke all on function public.disconnect_akahu(uuid) from public, anon, authenticated;
grant execute on function public.disconnect_akahu(uuid) to service_role;

-- 9. Delete a user's data. All of it happens or none of it does.
--    Joint rows, and rows owned for the partner, pass to the other household
--    member. Tables are found from the database itself, so a new table holding
--    user data is covered without changing this.
create or replace function public.delete_user_data(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  other uuid;
  other_role text;
  t record;
begin
  select user_id, role into other, other_role
  from public.household_members where user_id <> target
    and exists (select 1 from public.household_members where user_id = target)
  limit 1;

  if other is not null then
    update public.fin_accounts set user_id = other where user_id = target and owner in ('joint', other_role);
    update public.fin_bills set user_id = other where user_id = target and owner in ('joint', other_role);
    update public.fin_goals set user_id = other where user_id = target and owner in ('joint', other_role);
    update public.fin_transactions tx set user_id = other
      from public.fin_accounts a where a.id = tx.account_id and a.user_id = other and tx.user_id = target;

    -- Categories belong to the person leaving, so kept rows let go of them.
    update public.fin_transactions set category_id = null
      where user_id = other and category_id in (select id from public.fin_categories where user_id = target);
    update public.fin_bills set category_id = null
      where user_id = other and category_id in (select id from public.fin_categories where user_id = target);
  end if;

  -- Every column pointing at the user or their profile, then any user_id column.
  -- Profiles go last, because other tables can depend on them.
  for t in
    select tbl, col from (
      select con.conrelid::regclass::text as tbl, a.attname::text as col
      from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      where con.contype = 'f'
        and con.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
        and array_length(con.conkey, 1) = 1
        and con.confdeltype <> 'n'
        and n.nspname = 'public'
      union
      select format('public.%I', c.table_name), 'user_id'
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = 'user_id'
    ) found
    where tbl not in ('profiles', 'public.profiles')
  loop
    execute format('delete from %s where %I = $1', t.tbl, t.col) using target;
  end loop;

  delete from public.profiles where id = target;
end;
$$;
revoke all on function public.delete_user_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_data(uuid) to service_role;

commit;

-- Check: anything below is open to every signed-in user. Finance tables must not
-- appear. Public content, such as the community feed, is expected to.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and permissive = 'PERMISSIVE'
  and (qual = 'true' or with_check = 'true')
order by 1, 2;
