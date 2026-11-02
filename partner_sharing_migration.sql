-- ── Partner sharing ──────────────────────────────────────────────────────────
-- Run in the Fennec SI Supabase SQL editor (project: vgvcyopwmczkrpkvarpy),
-- after per_user_finance_migration.sql. Safe to re-run. Nothing is deleted.
--
-- Replaces the old fixed household (household_members, me/partner) with links
-- any two accounts can make:
--   - One person creates an invite link, the other opens it and accepts.
--     The backend makes and removes links; either person can unlink.
--   - Each bank account has a share level: private (default), balance, or
--     full (balance and transactions). Business accounts are never shared.
--   - A partner's shared accounts are read through shared_accounts() and
--     shared_transactions(), read-only, and never mixed into your own lists or
--     totals. The fin_* tables only return your own rows.
--   - Bills and goals marked joint are shared with your partner, who can edit
--     them too.
--
-- household_members is left in place but no longer used.

begin;

-- 1. Links between two accounts.
create table if not exists public.partner_links (
  id          uuid primary key default gen_random_uuid(),
  inviter     uuid not null references auth.users(id) on delete cascade,
  invitee     uuid references auth.users(id) on delete cascade,
  code        text not null unique,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);
create unique index if not exists partner_links_inviter_key on public.partner_links (inviter);
create unique index if not exists partner_links_invitee_key on public.partner_links (invitee) where invitee is not null;

alter table public.partner_links enable row level security;
drop policy if exists "people read their own link" on public.partner_links;
create policy "people read their own link" on public.partner_links
  for select to authenticated using (inviter = auth.uid() or invitee = auth.uid());
drop policy if exists "require 2fa when enrolled" on public.partner_links;
create policy "require 2fa when enrolled" on public.partner_links as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- The signed-in person's linked partner, or null.
create or replace function public.my_partner()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when l.inviter = auth.uid() then l.invitee else l.inviter end
  from public.partner_links l
  where l.accepted_at is not null and l.invitee is not null
    and (l.inviter = auth.uid() or l.invitee = auth.uid())
  limit 1;
$$;
revoke all on function public.my_partner() from public, anon;
grant execute on function public.my_partner() to authenticated;

-- 2. Share level on each account. The first run turns existing joint accounts
--    into fully shared ones; later runs leave the setting alone.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_accounts' and column_name = 'share_level'
  ) then
    alter table public.fin_accounts add column share_level text not null default 'private'
      check (share_level in ('private', 'balance', 'full'));
    update public.fin_accounts set share_level = 'full' where owner = 'joint' and not is_business;
  end if;
end $$;

-- 3. Replace the permissive rules. The 2FA rule is restrictive and stays.
do $$
declare
  p record;
  t text;
  shared constant text := '(user_id = auth.uid() or (owner = ''joint'' and user_id = public.my_partner()))';
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and permissive = 'PERMISSIVE'
      and tablename in ('fin_accounts', 'fin_bills', 'fin_goals', 'fin_transactions', 'fin_goal_contributions')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;

  create policy fin_accounts_owner on public.fin_accounts for all to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());

  create policy fin_transactions_owner on public.fin_transactions for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid()
      and exists (select 1 from public.fin_accounts a where a.id = account_id and a.user_id = auth.uid()));

  foreach t in array array['fin_bills', 'fin_goals'] loop
    execute format('create policy %I on public.%I for all to authenticated using %s with check %s', t || '_owner', t, shared, shared);
  end loop;

  -- Follows its goal, whose own rule applies inside the check.
  create policy fin_goal_contributions_owner on public.fin_goal_contributions for all to authenticated
    using (exists (select 1 from public.fin_goals g where g.id = goal_id))
    with check (exists (select 1 from public.fin_goals g where g.id = goal_id));
end $$;

-- 4. What a partner has shared. Read-only, and only after the viewer has
--    passed 2FA (these run as the owner, so the table's 2FA rule doesn't apply).
create or replace function public.shared_accounts()
returns table (id uuid, name text, type text, current_balance numeric, last_synced timestamptz, share_level text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.name, a.type, a.current_balance, a.last_synced, a.share_level
  from public.fin_accounts a
  where public.mfa_satisfied()
    and a.user_id = public.my_partner()
    and a.share_level in ('balance', 'full')
    and not a.is_business
  order by a.name;
$$;

create or replace function public.shared_transactions(account uuid, max_rows integer default 200)
returns table (id uuid, date date, description text, amount numeric, category text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.date, t.description, t.amount, c.name
  from public.fin_transactions t
  left join public.fin_categories c on c.id = t.category_id
  where public.mfa_satisfied()
    and t.account_id = account
    and exists (
      select 1 from public.fin_accounts a
      where a.id = account and a.user_id = public.my_partner()
        and a.share_level = 'full' and not a.is_business
    )
  order by t.date desc
  limit least(greatest(max_rows, 1), 500);
$$;

revoke all on function public.shared_accounts() from public, anon;
grant execute on function public.shared_accounts() to authenticated;
revoke all on function public.shared_transactions(uuid, integer) from public, anon;
grant execute on function public.shared_transactions(uuid, integer) to authenticated;

-- 5. Deleting an account: joint bills and goals pass to the partner. Bank
--    accounts and everything else go with the person leaving.
create or replace function public.delete_user_data(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  other uuid;
  t record;
begin
  select case when l.inviter = target then l.invitee else l.inviter end into other
  from public.partner_links l
  where l.accepted_at is not null and l.invitee is not null
    and (l.inviter = target or l.invitee = target)
  limit 1;

  if other is not null then
    -- Categories and accounts belong to the person leaving, so kept rows let go of them.
    update public.fin_bills set user_id = other, category_id = null, account_id = null
      where user_id = target and owner = 'joint';
    update public.fin_goals set user_id = other where user_id = target and owner = 'joint';
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
