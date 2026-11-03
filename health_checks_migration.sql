-- ── Nightly health check results ────────────────────────────────────────────
-- Run in the Fennec SI Supabase SQL editor. Safe to re-run.
-- Only the backend reads and writes this table, so it has row rules switched on
-- and no rules that let anyone in. The admin page reads it through the backend.

create table if not exists public.health_checks (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  trigger text not null check (trigger in ('scheduled', 'manual')),
  ok boolean not null,
  failed int not null default 0,
  results jsonb not null
);
create index if not exists health_checks_ran_at_idx on public.health_checks (ran_at desc);

alter table public.health_checks enable row level security;
revoke all on public.health_checks from anon, authenticated;
revoke all on sequence public.health_checks_id_seq from anon, authenticated;

-- Keep 90 days.
delete from public.health_checks where ran_at < now() - interval '90 days';
