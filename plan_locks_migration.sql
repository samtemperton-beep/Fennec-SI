-- ── Plan locks in the database ───────────────────────────────────────────────
-- Run in the Fennec SI Supabase SQL editor (project: vgvcyopwmczkrpkvarpy).
-- Safe to re-run. It changes rules only and doesn't touch any data.
--
-- The app hides what a plan doesn't include, and the backend refuses those AI
-- calls. A few things are read or written by the browser straight to the
-- database, so the plan is checked here as well:
--   - Business section: invoices, invoice lines and business settings.
--   - Holdings: adding one past the plan's limit is refused. The backend's
--     Akahu sync applies the same limit itself.
--
-- The plan comes from the same admin settings as the backend
-- (plan_<tier>_<feature> and limit_<tier>_<limit> in platform_settings), with
-- the same defaults as backend/src/services/plans.ts. Change a default there and
-- here together.

begin;

-- 1. The account's plan tier.
create or replace function public.plan_tier(target uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when p.subscription_tier = 'premium' then 'premium' else 'free' end
  from public.profiles p where p.id = target;
$$;

-- 2. Whether the signed-in account's plan includes a feature.
create or replace function public.plan_allows(feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select coalesce(public.plan_tier(auth.uid()), 'free') as tier)
  select coalesce(
    (select s.value = 'on' from public.platform_settings s, me
      where s.key = 'plan_' || me.tier || '_' || feature and s.value in ('on', 'off')),
    (select me.tier = 'premium' or feature not in ('deep_dive', 'draft_post', 'inbox', 'business', 'verified') from me)
  );
$$;

-- 3. A plan limit for one account. 0 means no limit.
create or replace function public.plan_limit(target uuid, lim text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select coalesce(public.plan_tier(target), 'free') as tier)
  select coalesce(
    (select s.value::integer from public.platform_settings s, me
      where s.key = 'limit_' || me.tier || '_' || lim and s.value ~ '^\d{1,6}$'),
    (select case lim
       when 'holdings' then case when me.tier = 'premium' then 0 else 10 end
       else 0 end from me)
  );
$$;

revoke all on function public.plan_tier(uuid) from public, anon, authenticated;
revoke all on function public.plan_allows(text) from public, anon;
grant execute on function public.plan_allows(text) to authenticated;
revoke all on function public.plan_limit(uuid, text) from public, anon;
grant execute on function public.plan_limit(uuid, text) to authenticated;

-- 4. Business tables follow the plan. Restrictive, so it only ever takes away.
do $$
declare
  t text;
begin
  foreach t in array array['business_invoices', 'business_invoice_items', 'business_settings'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipped %, not found', t;
      continue;
    end if;
    execute format('drop policy if exists "plan includes business" on public.%I', t);
    execute format(
      'create policy "plan includes business" on public.%I as restrictive for all to authenticated '
      'using ((select public.plan_allows(''business''))) with check ((select public.plan_allows(''business'')))', t);
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise warning '% has row level security off, so this rule does nothing. Tell Claude.', t;
    end if;
  end loop;
end $$;

-- 5. Holdings limit for adds from the app. The backend (service role) is let
--    through: its Akahu sync applies the limit itself.
create or replace function public.enforce_holdings_limit()
returns trigger
language plpgsql
as $$
declare
  lim integer;
begin
  if current_user in ('authenticated', 'anon') then
    lim := public.plan_limit(new.user_id, 'holdings');
    if lim > 0 and (select count(*) from public.holdings where user_id = new.user_id) >= lim then
      raise exception 'Your plan tracks up to % holdings.', lim using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_holdings_limit on public.holdings;
create trigger enforce_holdings_limit
  before insert on public.holdings
  for each row execute function public.enforce_holdings_limit();

commit;
