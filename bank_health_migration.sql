-- Bank connection health: what happened on each person's last bank sync, so
-- the app, the fox chat and a support report can explain why transactions
-- aren't updating without anyone looking inside their account.
-- Holds bank and account names, statuses, dates and counts. No balances,
-- no transaction descriptions, no tokens.
-- Run once in the Supabase SQL Editor. Safe to run again.

begin;

create table if not exists public.bank_sync_health (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  checked_at timestamptz not null default now(),
  ok boolean not null default true,
  error text,
  accounts jsonb not null default '[]'::jsonb,
  added int not null default 0,
  last_ok_at timestamptz,
  last_added_at timestamptz,
  refresh_requested_at timestamptz,
  report_sent_at timestamptz
);
alter table public.bank_sync_health enable row level security;
drop policy if exists "People read their own bank health" on public.bank_sync_health;
create policy "People read their own bank health" on public.bank_sync_health
  for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.bank_sync_health from anon, authenticated;

commit;

-- Check: should return one row, rls_on = true.
select relname, relrowsecurity as rls_on from pg_class where relname = 'bank_sync_health';
