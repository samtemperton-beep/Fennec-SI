-- ── Akahu as the source of truth for broker holdings + KiwiSaver ─────────────
-- Run this in the Fennec SI Supabase SQL editor (project: vgvcyopwmczkrpkvarpy)
-- Safe to re-run.

-- Holdings: where a row came from, the broker's name for it, and whether its
-- price must not be overwritten by a market-data lookup (e.g. when two
-- instruments share a ticker, as with SpaceX and the SPAC & New Issue ETF).
alter table public.holdings add column if not exists name text;
alter table public.holdings add column if not exists source text;                       -- 'akahu' | null (manual / CSV)
alter table public.holdings add column if not exists price_locked boolean not null default false;

-- KiwiSaver: extra fields Akahu provides.
alter table public.fin_kiwisaver add column if not exists akahu_returns numeric(14,2);   -- total returns to date, NZD
alter table public.fin_kiwisaver add column if not exists pir numeric(5,2);              -- prescribed investor rate, percent (28 = 28%)
alter table public.fin_kiwisaver add column if not exists akahu_synced_at timestamptz;

-- Snapshot of the last sync, so pages can show status without re-calling Akahu.
create table if not exists public.akahu_sync_status (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  synced_at          timestamptz not null default now(),
  broker_accounts    jsonb not null default '[]'::jsonb,
  kiwisaver_accounts jsonb not null default '[]'::jsonb,
  warnings           jsonb not null default '[]'::jsonb,
  capped             boolean not null default false
);

alter table public.akahu_sync_status enable row level security;

-- Users can read their own status; only the backend (service role) writes it.
drop policy if exists "users read own akahu status" on public.akahu_sync_status;
create policy "users read own akahu status"
  on public.akahu_sync_status for select
  using (user_id = auth.uid());
