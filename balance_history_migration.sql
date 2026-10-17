-- ── Value history: one snapshot per account per day ──────────────────────────
-- Run in the Fennec SI Supabase SQL editor (project: vgvcyopwmczkrpkvarpy).
-- Safe to re-run. Additive: creates one new table, changes nothing existing.
--
-- Akahu only ever reports "now", so history can only be built going forward by
-- recording what each provider reports at every sync. Rows hold the PROVIDER'S
-- valuation (not Fennec's live-price overlay) so the series is consistent.

create table if not exists public.balance_snapshots (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,                                   -- NZ date the provider's data is from
  kind          text not null check (kind in ('broker', 'kiwisaver')),
  account_id    text not null,                                   -- Akahu account id
  label         text not null,                                   -- e.g. 'Hatch', 'Milford'
  currency      text not null,                                   -- 'USD' for Hatch, 'NZD' for KiwiSaver
  value         numeric(16,2) not null,                          -- broker: holdings value (excl. cash); KiwiSaver: balance
  cash          numeric(16,2),                                   -- broker cash wallet
  invested      numeric(16,2),                                   -- broker: cost basis; KiwiSaver: balance - returns
  returns       numeric(16,2),                                   -- provider-reported total returns
  refreshed_at  timestamptz,                                     -- when the provider's data was last refreshed
  taken_at      timestamptz not null default now(),
  unique (user_id, snapshot_date, account_id)
);

create index if not exists balance_snapshots_user_kind_date
  on public.balance_snapshots (user_id, kind, snapshot_date);

alter table public.balance_snapshots enable row level security;

-- Users can read their own history; only the backend (service role) writes it.
drop policy if exists "users read own balance snapshots" on public.balance_snapshots;
create policy "users read own balance snapshots"
  on public.balance_snapshots for select
  using (user_id = auth.uid());
