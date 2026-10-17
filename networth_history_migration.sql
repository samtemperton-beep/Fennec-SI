-- ── Net worth history: one point per user per day ────────────────────────────
-- Run in the Fennec SI Supabase SQL editor (project: vgvcyopwmczkrpkvarpy).
-- Safe to re-run. Additive: creates one new table, changes nothing existing.
--
-- Written by the backend (GET /api/networth and the scheduled Akahu sync), all
-- values in NZD. Feeds the dashboard's net worth trend chart.

create table if not exists public.networth_snapshots (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,                 -- NZ date
  total         numeric(16,2) not null,
  bank          numeric(16,2) not null default 0,
  investments   numeric(16,2) not null default 0,
  kiwisaver     numeric(16,2) not null default 0,
  property      numeric(16,2) not null default 0,
  debt          numeric(16,2) not null default 0, -- negative
  taken_at      timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

alter table public.networth_snapshots enable row level security;

-- Users can read their own history; only the backend (service role) writes it.
drop policy if exists "users read own networth snapshots" on public.networth_snapshots;
create policy "users read own networth snapshots"
  on public.networth_snapshots for select
  using (user_id = auth.uid());
