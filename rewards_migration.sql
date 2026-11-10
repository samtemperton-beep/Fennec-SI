-- Budget rewards, no-spend pledges and accountability buddies.
-- Run once in the Supabase SQL Editor, AFTER notifications_migration.sql. Safe to run again.

begin;

-- 1. Points and badges. One row per thing earned (a week under budget, a
--    badge), so nothing is counted twice. Only the server writes these.
create table if not exists public.money_rewards (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  ref text not null,
  points int not null default 0,
  earned_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create index if not exists money_rewards_user_idx on public.money_rewards(user_id, earned_at desc);
alter table public.money_rewards enable row level security;
drop policy if exists "People read their own rewards" on public.money_rewards;
create policy "People read their own rewards" on public.money_rewards
  for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.money_rewards from anon, authenticated;

-- 2. Pledges: places you've said you won't spend (Lotto, betting, Uber Eats).
create table if not exists public.pledges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  keywords text[] not null check (cardinality(keywords) between 1 and 20),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists pledges_user_idx on public.pledges(user_id);
alter table public.pledges enable row level security;
drop policy if exists "People manage their own pledges" on public.pledges;
create policy "People manage their own pledges" on public.pledges
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Spending found at a pledged place. Only the server writes these.
create table if not exists public.pledge_slips (
  id bigserial primary key,
  pledge_id uuid not null references public.pledges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  transaction_id uuid not null,
  description text,
  amount numeric(12,2) not null,
  date date not null,
  created_at timestamptz not null default now(),
  unique (pledge_id, transaction_id)
);
create index if not exists pledge_slips_user_idx on public.pledge_slips(user_id, date desc);
alter table public.pledge_slips enable row level security;
drop policy if exists "People read their own slips" on public.pledge_slips;
create policy "People read their own slips" on public.pledge_slips
  for select to authenticated using (auth.uid() = user_id);
revoke insert, update on public.pledge_slips from anon, authenticated;

-- 3. Accountability buddies. owner_id is the person being kept on track;
--    the buddy is invited by email and must accept. Only the server reads
--    and writes these, so each side sees only what the owner chose to share.
create table if not exists public.buddies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  buddy_email text not null,
  buddy_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active')),
  share_amounts boolean not null default false,
  share_budgets boolean not null default true,
  share_goals boolean not null default true,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (owner_id, buddy_email)
);
create index if not exists buddies_email_idx on public.buddies(lower(buddy_email));
create index if not exists buddies_buddy_idx on public.buddies(buddy_id);
alter table public.buddies enable row level security;
revoke all on public.buddies from anon, authenticated;

-- 4. Switches for the new notifications.
alter table public.notification_prefs add column if not exists reward_alerts boolean not null default true;
alter table public.notification_prefs add column if not exists pledge_alerts boolean not null default true;
alter table public.notification_prefs add column if not exists buddy_alerts boolean not null default true;

commit;

-- Check: should list buddies, money_rewards, pledge_slips and pledges.
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('money_rewards', 'pledges', 'pledge_slips', 'buddies')
order by 1;
