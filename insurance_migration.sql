-- Finance → Insurance: policies people add (read from a policy schedule, or
-- typed in), checked by Fennec, with a reminder before each renewal.
-- No names, policy numbers, bank account numbers or street addresses are
-- stored: just the insurer, the cover and the figures.
-- Run once in the Supabase SQL Editor, AFTER rental_migration.sql. Safe to run again.

begin;

create table if not exists public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null default 'home' check (kind in ('home', 'landlord', 'contents', 'car', 'life', 'health', 'income', 'travel', 'pet', 'other')),
  holder text not null default 'me' check (holder in ('me', 'partner', 'joint')),
  insurer text not null check (length(insurer) between 1 and 60),
  label text check (label is null or length(label) <= 80),
  rental_property_id uuid references public.rental_properties(id) on delete set null,
  lives_there boolean,
  premium_total numeric(12,2) check (premium_total is null or premium_total >= 0),
  base_premium numeric(12,2) check (base_premium is null or base_premium >= 0),
  levies numeric(12,2) check (levies is null or levies >= 0),
  gst numeric(12,2) check (gst is null or gst >= 0),
  pay_frequency text check (pay_frequency is null or pay_frequency in ('annual', 'quarterly', 'monthly', 'fortnightly', 'weekly')),
  instalment numeric(12,2) check (instalment is null or instalment >= 0),
  start_date date,
  renewal_date date,
  sum_insured numeric(14,2) check (sum_insured is null or sum_insured >= 0),
  excess numeric(12,2) check (excess is null or excess >= 0),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists insurance_policies_user_idx on public.insurance_policies(user_id);
alter table public.insurance_policies enable row level security;
revoke all on public.insurance_policies from anon;
grant select, insert, update, delete on public.insurance_policies to authenticated;
drop policy if exists "People manage their own policies" on public.insurance_policies;
create policy "People manage their own policies" on public.insurance_policies
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "require 2fa when enrolled" on public.insurance_policies;
create policy "require 2fa when enrolled" on public.insurance_policies
  as restrictive for all to authenticated using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- A policy can only be linked to the person's own rental property.
create or replace function public.insurance_policies_rental_check()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.rental_property_id is not null and not exists (
    select 1 from public.rental_properties p where p.id = new.rental_property_id and p.user_id = new.user_id
  ) then
    raise exception 'That property isn''t yours';
  end if;
  return new;
end;
$$;
revoke all on function public.insurance_policies_rental_check() from public, anon, authenticated;
drop trigger if exists insurance_policies_rental_check on public.insurance_policies;
create trigger insurance_policies_rental_check
  before insert or update of rental_property_id on public.insurance_policies
  for each row execute function public.insurance_policies_rental_check();

alter table public.notification_prefs add column if not exists insurance_alerts boolean not null default true;

commit;

-- Check: rls_on should be true, and insurance_alerts should return 1.
select relname, relrowsecurity as rls_on from pg_class where relname = 'insurance_policies';
select count(*) as insurance_alerts from information_schema.columns where table_name = 'notification_prefs' and column_name = 'insurance_alerts';
