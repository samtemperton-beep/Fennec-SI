-- Fennec SI Database Schema
-- Run this in your Supabase SQL editor

-- Profiles table
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  avatar_color text default '#5b6aff',
  risk_level int default 7,
  created_at timestamptz default now(),
  total_gain_pct float default 0,
  picks_score int default 0,
  usage_count int default 0,
  last_usage_reset date default current_date
);

-- Holdings table
create table if not exists public.holdings (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  ticker text not null,
  shares float not null,
  buy_price float not null,
  current_price float default 0,
  market text default 'US',
  signal text,
  signal_reason text,
  sector text,
  added_at timestamptz default now()
);

-- Watchlist table
create table if not exists public.watchlist (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  ticker text not null,
  market text default 'US',
  target_price float,
  current_price float,
  change_pct float,
  signal text,
  sector text,
  pe float,
  mkt_cap text,
  div_yld float,
  w52_lo float,
  w52_hi float,
  note text,
  added_at timestamptz default now()
);

-- Posts table
create table if not exists public.posts (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  username text not null,
  type text not null,
  ticker text,
  signal text,
  body text not null,
  likes int default 0,
  created_at timestamptz default now()
);

-- Post likes table
create table if not exists public.post_likes (
  id bigserial primary key,
  post_id bigint references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  unique(post_id, user_id)
);

-- Alerts table
create table if not exists public.alerts (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  ticker text not null,
  type text not null,
  price float,
  triggered bool default false,
  created_at timestamptz default now()
);

-- Newsletter digests table
create table if not exists public.newsletter_digests (
  id bigserial primary key,
  source_id text not null,
  source_name text not null,
  source_color text,
  headline text not null,
  insight text,
  category text default 'general',
  tickers text[] default '{}',
  sentiment text default 'neutral',
  key_points text[] default '{}',
  actionable text,
  received_at timestamptz default now()
);

-- AI Cache table
create table if not exists public.ai_cache (
  cache_key text primary key,
  data jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table public.profiles enable row level security;
alter table public.holdings enable row level security;
alter table public.watchlist enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.alerts enable row level security;
alter table public.newsletter_digests enable row level security;
alter table public.ai_cache enable row level security;

-- RLS Policies

-- Profiles: users can read/write their own
create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Holdings: users can only access their own
create policy "Users can manage own holdings" on public.holdings for all using (auth.uid() = user_id);

-- Watchlist: users can only access their own
create policy "Users can manage own watchlist" on public.watchlist for all using (auth.uid() = user_id);

-- Posts: public read, own write
create policy "Posts are publicly readable" on public.posts for select using (true);
create policy "Users can insert own posts" on public.posts for insert with check (auth.uid() = user_id);
create policy "Users can update own posts" on public.posts for update using (auth.uid() = user_id);
create policy "Users can delete own posts" on public.posts for delete using (auth.uid() = user_id);

-- Post likes: users manage their own
create policy "Users can manage own likes" on public.post_likes for all using (auth.uid() = user_id);
create policy "Likes are publicly readable" on public.post_likes for select using (true);

-- Alerts: users can only access their own
create policy "Users can manage own alerts" on public.alerts for all using (auth.uid() = user_id);

-- Newsletter digests: public read, service-role write (no user policy needed for writes)
create policy "Newsletters are publicly readable" on public.newsletter_digests for select using (true);

-- AI Cache: public read (cache keys are opaque, not user-specific)
create policy "Cache is readable" on public.ai_cache for select using (true);

-- Function: auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)));
  return new;
end;
$$ language plpgsql security definer;

-- Trigger: fire on new user
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Enable realtime for community feed
alter publication supabase_realtime add table public.posts;
