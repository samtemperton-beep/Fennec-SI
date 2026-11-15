-- Finance → Rental: property manager (agent) statements.
-- - rental_agent_statements: one row per monthly statement, read from the PDF
--   by Claude and checked by the person. The agent keeps its fees and pays the
--   owner what's left (plus any tenant utility repayments), so the bank only
--   sees the net amount. Statements give the full rent, the fees, and bills
--   the agent paid, for the IR3 and the Rental figures.
-- - rental_properties.agent_fee_pct / agent_fee_plus_gst: the agent's fee, to
--   estimate months without a statement.
-- Names and bank account numbers aren't stored. Run AFTER rental_migration.sql.
-- Safe to run again.

begin;

create table if not exists public.rental_agent_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  agent text check (agent is null or length(agent) <= 80),
  period_start date,
  period_end date not null,
  -- Totals, all including GST.
  rent numeric(12,2) not null default 0 check (rent >= 0),
  fees numeric(12,2) not null default 0 check (fees >= 0),
  expenses numeric(12,2) not null default 0 check (expenses >= 0),
  utilities numeric(12,2) not null default 0 check (utilities >= 0),
  other_income numeric(12,2) not null default 0 check (other_income >= 0),
  paid_to_owner numeric(12,2) not null default 0 check (paid_to_owner >= 0),
  -- Each line: {date, kind, label, amount, fee_type?, line?}
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 200),
  source text not null default 'upload' check (source in ('upload', 'manual')),
  created_at timestamptz not null default now(),
  unique (property_id, period_end)
);
create index if not exists rental_agent_statements_user_idx on public.rental_agent_statements(user_id);
alter table public.rental_agent_statements enable row level security;
revoke all on public.rental_agent_statements from anon;
grant select, insert, update, delete on public.rental_agent_statements to authenticated;
drop policy if exists "People manage their own agent statements" on public.rental_agent_statements;
create policy "People manage their own agent statements" on public.rental_agent_statements
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "require 2fa when enrolled" on public.rental_agent_statements;
create policy "require 2fa when enrolled" on public.rental_agent_statements
  as restrictive for all to authenticated using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- A statement can only belong to the person's own property.
create or replace function public.rental_agent_statements_check()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.rental_properties p where p.id = new.property_id and p.user_id = new.user_id) then
    raise exception 'That property isn''t yours';
  end if;
  return new;
end;
$$;
revoke all on function public.rental_agent_statements_check() from public, anon, authenticated;
drop trigger if exists rental_agent_statements_check on public.rental_agent_statements;
create trigger rental_agent_statements_check
  before insert or update of property_id, user_id on public.rental_agent_statements
  for each row execute function public.rental_agent_statements_check();

alter table public.rental_properties add column if not exists agent_fee_pct numeric(5,2)
  check (agent_fee_pct is null or (agent_fee_pct >= 0 and agent_fee_pct <= 30));
alter table public.rental_properties add column if not exists agent_fee_plus_gst boolean not null default true;

commit;

-- Check: rls_on should be true, and agent_fee_column should be 1.
select relname, relrowsecurity as rls_on from pg_class where relname = 'rental_agent_statements';
select count(*) as agent_fee_column from information_schema.columns
where table_name = 'rental_properties' and column_name = 'agent_fee_pct';
