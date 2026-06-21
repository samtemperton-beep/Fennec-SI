-- Premium tier schema additions
-- Run this in your Supabase SQL editor after schema.sql

-- Add premium columns to profiles
alter table public.profiles
  add column if not exists subscription_tier text not null default 'free' check (subscription_tier in ('free', 'premium')),
  add column if not exists is_admin boolean not null default false,
  add column if not exists avatar_emoji text,
  add column if not exists avatar_url text,
  add column if not exists location text,
  add column if not exists profession text,
  add column if not exists tier_updated_at timestamptz;

-- Portfolio verifications: users upload a broker statement for Claude to verify
create table if not exists public.portfolio_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  document_url text,
  verified_tickers text[] default '{}',
  claude_notes text,
  created_at timestamptz default now(),
  verified_at timestamptz
);

create index if not exists portfolio_verifications_user_id_idx on public.portfolio_verifications(user_id);

-- Badge definitions (seed data)
create table if not exists public.badges (
  id text primary key,
  name text not null,
  description text not null,
  icon text not null,
  tier text not null check (tier in ('bronze', 'silver', 'gold', 'platinum'))
);

insert into public.badges (id, name, description, icon, tier) values
  ('verified_investor',   'Verified Investor',    'Linked and verified your real investment portfolio',          '✅', 'gold'),
  ('first_gain',          'In The Green',          'Portfolio showing a positive overall gain',                  '📈', 'bronze'),
  ('gain_10',             '10% Club',              'Portfolio up 10% or more overall',                          '🥉', 'silver'),
  ('gain_25',             '25% Grower',            'Portfolio up 25% or more overall',                          '🥈', 'silver'),
  ('gain_50',             '50% Achiever',          'Portfolio up 50% or more overall',                          '🥇', 'gold'),
  ('gain_100',            'Doubled Up',            'Portfolio has doubled in value',                            '💰', 'platinum'),
  ('diversified',         'Well Diversified',      'Holdings spread across 5 or more different sectors',        '🌐', 'silver'),
  ('five_holdings',       'Five Stock Club',       'Tracking 5 or more stocks in your portfolio',              '📊', 'bronze'),
  ('ten_holdings',        'Ten Bagger Tracker',    'Tracking 10 or more stocks in your portfolio',             '🏦', 'silver'),
  ('early_adopter',       'Early Adopter',         'Joined Fennec SI in the early days',                       '🚀', 'gold')
on conflict (id) do nothing;

-- User badges (earned)
create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  badge_id text references public.badges(id) not null,
  earned_at timestamptz default now(),
  metadata jsonb default '{}',
  unique(user_id, badge_id)
);

create index if not exists user_badges_user_id_idx on public.user_badges(user_id);

-- Add verified flag to holdings so individual stocks can show the verified checkmark
alter table public.holdings
  add column if not exists is_verified boolean not null default false;

-- RLS policies
alter table public.portfolio_verifications enable row level security;
alter table public.user_badges enable row level security;
alter table public.badges enable row level security;

create policy "Users can view own verifications" on public.portfolio_verifications for select using (auth.uid() = user_id);
create policy "Users can insert own verifications" on public.portfolio_verifications for insert with check (auth.uid() = user_id);

create policy "Users can view own badges" on public.user_badges for select using (auth.uid() = user_id);
create policy "Badges are public" on public.badges for select using (true);

-- Leaderboard: admins can read all verified portfolio stats (used for leaderboard query)
create policy "Public leaderboard view" on public.profiles for select using (true);
