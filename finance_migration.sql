-- ============================================================
-- Fennec SI — Finance module migration
-- Run this in the Fennec SI Supabase SQL editor (project: vgvcyopwmczkrpkvarpy)
-- ============================================================

-- ── Helper: updated_at trigger (may already exist on this project) ──────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ── 1. household_members ────────────────────────────────────────────────────
create table if not exists household_members (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role        text not null check (role in ('me', 'partner')),
  created_at  timestamptz not null default now()
);
alter table household_members enable row level security;

-- Security-definer function breaks RLS recursion
create or replace function is_household_member()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from household_members where user_id = auth.uid());
$$;

create or replace function current_household_role()
returns text language sql security definer set search_path = public stable as $$
  select role from household_members where user_id = auth.uid();
$$;

drop policy if exists "household_members_select" on household_members;
create policy "household_members_select" on household_members
  for select using (is_household_member());

-- ── 2. accounts ──────────────────────────────────────────────────────────────
create table if not exists fin_accounts (
  id                uuid primary key default gen_random_uuid(),
  owner             text not null check (owner in ('me', 'partner', 'joint')),
  akahu_account_id  text unique,
  name              text not null,
  type              text not null,
  current_balance   numeric(12,2) not null default 0,
  is_business       boolean not null default false,
  is_rental         boolean not null default false,
  last_synced       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table fin_accounts enable row level security;
create policy "fin_accounts_select" on fin_accounts for select
  using (owner = 'joint' or owner = current_household_role());
create policy "fin_accounts_insert" on fin_accounts for insert
  with check (owner = 'joint' or owner = current_household_role());
create policy "fin_accounts_update" on fin_accounts for update
  using (owner = 'joint' or owner = current_household_role())
  with check (owner = 'joint' or owner = current_household_role());
create policy "fin_accounts_delete" on fin_accounts for delete
  using (owner = 'joint' or owner = current_household_role());

drop trigger if exists fin_accounts_set_updated_at on fin_accounts;
create trigger fin_accounts_set_updated_at
  before update on fin_accounts for each row execute function set_updated_at();

-- ── 3. categories ────────────────────────────────────────────────────────────
create table if not exists fin_categories (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  scope          text not null default 'household' check (scope in ('household','business')),
  monthly_budget numeric(12,2),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (name, scope)
);
alter table fin_categories enable row level security;
create policy "fin_categories_select" on fin_categories for select using (is_household_member());
create policy "fin_categories_insert" on fin_categories for insert with check (is_household_member());
create policy "fin_categories_update" on fin_categories for update
  using (is_household_member()) with check (is_household_member());
create policy "fin_categories_delete" on fin_categories for delete using (is_household_member());

drop trigger if exists fin_categories_set_updated_at on fin_categories;
create trigger fin_categories_set_updated_at
  before update on fin_categories for each row execute function set_updated_at();

-- Seed default categories
insert into fin_categories (name, scope) values
  ('Groceries','household'), ('Rent/Mortgage','household'), ('Utilities','household'),
  ('Transport','household'), ('Dining Out','household'), ('Entertainment','household'),
  ('Subscriptions','household'), ('Health & Wellness','household'), ('Shopping','household'),
  ('Insurance','household'), ('Savings','household'), ('Income','household'),
  ('Miscellaneous','household')
on conflict (name, scope) do nothing;

-- ── 4. category_rules ────────────────────────────────────────────────────────
create table if not exists fin_category_rules (
  id          uuid primary key default gen_random_uuid(),
  pattern     text not null,
  category_id uuid not null references fin_categories (id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table fin_category_rules enable row level security;
create policy "fin_category_rules_select" on fin_category_rules for select using (is_household_member());
create policy "fin_category_rules_insert" on fin_category_rules for insert with check (is_household_member());
create policy "fin_category_rules_update" on fin_category_rules for update
  using (is_household_member()) with check (is_household_member());
create policy "fin_category_rules_delete" on fin_category_rules for delete using (is_household_member());

-- Auto-categorise trigger
create or replace function fin_apply_category_rule()
returns trigger as $$
begin
  if new.category_id is null then
    select category_id into new.category_id
    from fin_category_rules
    where new.description ilike '%' || pattern || '%'
    order by length(pattern) desc
    limit 1;
  end if;
  return new;
end;
$$ language plpgsql;

-- ── 5. transactions ──────────────────────────────────────────────────────────
create table if not exists fin_transactions (
  id                      uuid primary key default gen_random_uuid(),
  account_id              uuid not null references fin_accounts (id) on delete cascade,
  akahu_transaction_id    text unique,
  date                    date not null,
  description             text,
  amount                  numeric(12,2) not null,
  category_id             uuid references fin_categories (id) on delete set null,
  is_shared               boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists fin_transactions_account_id_idx on fin_transactions (account_id);
create index if not exists fin_transactions_date_idx on fin_transactions (date);
alter table fin_transactions enable row level security;

create policy "fin_transactions_select" on fin_transactions for select using (
  exists (select 1 from fin_accounts a where a.id = fin_transactions.account_id
    and (a.owner = 'joint' or a.owner = current_household_role()))
);
create policy "fin_transactions_insert" on fin_transactions for insert with check (
  exists (select 1 from fin_accounts a where a.id = fin_transactions.account_id
    and (a.owner = 'joint' or a.owner = current_household_role()))
);
create policy "fin_transactions_update" on fin_transactions for update
  using (exists (select 1 from fin_accounts a where a.id = fin_transactions.account_id
    and (a.owner = 'joint' or a.owner = current_household_role())))
  with check (exists (select 1 from fin_accounts a where a.id = fin_transactions.account_id
    and (a.owner = 'joint' or a.owner = current_household_role())));
create policy "fin_transactions_delete" on fin_transactions for delete using (
  exists (select 1 from fin_accounts a where a.id = fin_transactions.account_id
    and (a.owner = 'joint' or a.owner = current_household_role()))
);

drop trigger if exists fin_transactions_set_updated_at on fin_transactions;
create trigger fin_transactions_set_updated_at
  before update on fin_transactions for each row execute function set_updated_at();

drop trigger if exists fin_transactions_apply_category_rule on fin_transactions;
create trigger fin_transactions_apply_category_rule
  before insert on fin_transactions for each row execute function fin_apply_category_rule();

-- ── 6. goals ────────────────────────────────────────────────────────────────
create table if not exists fin_goals (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  target_amount        numeric(12,2) not null,
  current_amount       numeric(12,2) not null default 0,
  monthly_contribution numeric(12,2),
  target_date          date,
  owner                text not null default 'joint' check (owner in ('me','partner','joint')),
  status               text not null default 'active' check (status in ('active','paused','completed')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
alter table fin_goals enable row level security;
create policy "fin_goals_select" on fin_goals for select
  using (owner = 'joint' or owner = current_household_role());
create policy "fin_goals_insert" on fin_goals for insert
  with check (owner = 'joint' or owner = current_household_role());
create policy "fin_goals_update" on fin_goals for update
  using (owner = 'joint' or owner = current_household_role())
  with check (owner = 'joint' or owner = current_household_role());
create policy "fin_goals_delete" on fin_goals for delete
  using (owner = 'joint' or owner = current_household_role());

drop trigger if exists fin_goals_set_updated_at on fin_goals;
create trigger fin_goals_set_updated_at
  before update on fin_goals for each row execute function set_updated_at();

-- ── 7. goal_contributions ────────────────────────────────────────────────────
create table if not exists fin_goal_contributions (
  id         uuid primary key default gen_random_uuid(),
  goal_id    uuid not null references fin_goals (id) on delete cascade,
  date       date not null default current_date,
  amount     numeric(12,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists fin_goal_contributions_goal_id_idx on fin_goal_contributions (goal_id);
alter table fin_goal_contributions enable row level security;
create policy "fin_goal_contributions_select" on fin_goal_contributions for select using (
  exists (select 1 from fin_goals g where g.id = fin_goal_contributions.goal_id
    and (g.owner = 'joint' or g.owner = current_household_role()))
);
create policy "fin_goal_contributions_insert" on fin_goal_contributions for insert with check (
  exists (select 1 from fin_goals g where g.id = fin_goal_contributions.goal_id
    and (g.owner = 'joint' or g.owner = current_household_role()))
);
create policy "fin_goal_contributions_update" on fin_goal_contributions for update
  using (exists (select 1 from fin_goals g where g.id = fin_goal_contributions.goal_id
    and (g.owner = 'joint' or g.owner = current_household_role())))
  with check (exists (select 1 from fin_goals g where g.id = fin_goal_contributions.goal_id
    and (g.owner = 'joint' or g.owner = current_household_role())));
create policy "fin_goal_contributions_delete" on fin_goal_contributions for delete using (
  exists (select 1 from fin_goals g where g.id = fin_goal_contributions.goal_id
    and (g.owner = 'joint' or g.owner = current_household_role()))
);

-- Keep current_amount in sync with contributions
create or replace function fin_sync_goal_current_amount()
returns trigger as $$
declare target_goal_id uuid;
begin
  target_goal_id := coalesce(new.goal_id, old.goal_id);
  update fin_goals set current_amount = (
    select coalesce(sum(amount), 0) from fin_goal_contributions where goal_id = target_goal_id
  ) where id = target_goal_id;
  return null;
end;
$$ language plpgsql;

drop trigger if exists fin_goal_contributions_sync_amount on fin_goal_contributions;
create trigger fin_goal_contributions_sync_amount
  after insert or update or delete on fin_goal_contributions
  for each row execute function fin_sync_goal_current_amount();

-- ── 8. bills ────────────────────────────────────────────────────────────────
create table if not exists fin_bills (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  amount        numeric(12,2) not null,
  category_id   uuid references fin_categories (id) on delete set null,
  account_id    uuid references fin_accounts (id) on delete set null,
  frequency     text not null check (frequency in ('weekly','fortnightly','monthly','quarterly','annually')),
  next_due_date date not null,
  owner         text not null default 'joint' check (owner in ('me','partner','joint')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table fin_bills enable row level security;
create policy "fin_bills_select" on fin_bills for select
  using (owner = 'joint' or owner = current_household_role());
create policy "fin_bills_insert" on fin_bills for insert
  with check (owner = 'joint' or owner = current_household_role());
create policy "fin_bills_update" on fin_bills for update
  using (owner = 'joint' or owner = current_household_role())
  with check (owner = 'joint' or owner = current_household_role());
create policy "fin_bills_delete" on fin_bills for delete
  using (owner = 'joint' or owner = current_household_role());

drop trigger if exists fin_bills_set_updated_at on fin_bills;
create trigger fin_bills_set_updated_at
  before update on fin_bills for each row execute function set_updated_at();

-- ── 9. akahu_credentials ─────────────────────────────────────────────────────
create table if not exists akahu_credentials (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  app_token     text not null,
  user_token    text not null,
  last_synced_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table akahu_credentials enable row level security;
create policy "akahu_credentials_select" on akahu_credentials for select using (user_id = auth.uid());
create policy "akahu_credentials_insert" on akahu_credentials for insert with check (user_id = auth.uid());
create policy "akahu_credentials_update" on akahu_credentials for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "akahu_credentials_delete" on akahu_credentials for delete using (user_id = auth.uid());

drop trigger if exists akahu_credentials_set_updated_at on akahu_credentials;
create trigger akahu_credentials_set_updated_at
  before update on akahu_credentials for each row execute function set_updated_at();

-- ── 10. Add yourself to household_members ────────────────────────────────────
-- Replace <YOUR_USER_ID> with your Fennec SI auth user id (from Supabase > Auth > Users)
-- INSERT INTO household_members (user_id, display_name, role)
-- VALUES ('<YOUR_USER_ID>', 'Sam', 'me')
-- ON CONFLICT DO NOTHING;
