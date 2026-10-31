-- ── Close the rules left open to every user ──────────────────────────────────
-- Run in the Fennec SI Supabase SQL editor, after per_user_finance_migration.sql.
-- Safe to re-run. It changes rules only and doesn't touch any data.
--
-- Rules written for the backend had no "to service_role", so they applied to
-- everyone. The backend's service role bypasses row level security, so it never
-- needed them.
--
--   - platform_settings: backend only.
--   - portfolio_verifications: people read their own. Only the backend writes.
--   - newsletter_digests: still readable, but only the backend writes.
--   - profiles: nobody can change their own admin flag, plan, usage count or
--     leaderboard score, and other people's profiles are no longer readable.
--     The leaderboard reads a view holding only what it shows.

begin;

-- 1. Remove the open rules.
do $$
declare
  p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and permissive = 'PERMISSIVE'
      and (qual = 'true' or with_check = 'true')
      and (tablename in ('platform_settings', 'portfolio_verifications')
        or (tablename = 'newsletter_digests' and cmd <> 'SELECT')
        or tablename = 'profiles')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

drop policy if exists "Users read own verifications" on public.portfolio_verifications;
create policy "Users read own verifications" on public.portfolio_verifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);

-- 2. The leaderboard's view. It runs as its owner, so it can read every row,
--    and these three columns are all it exposes.
create or replace view public.leaderboard_profiles as
  select username, picks_score, total_gain_pct from public.profiles;
revoke all on public.leaderboard_profiles from public, anon;
grant select on public.leaderboard_profiles to authenticated;

-- 3. Columns only the backend may change. Browser writes to them are ignored.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_admin := false;
      new.subscription_tier := 'free';
      new.tier_updated_at := null;
      new.usage_count := 0;
      new.last_usage_reset := current_date;
      new.picks_score := 0;
      new.total_gain_pct := 0;
    else
      new.is_admin := old.is_admin;
      new.subscription_tier := old.subscription_tier;
      new.tier_updated_at := old.tier_updated_at;
      new.usage_count := old.usage_count;
      new.last_usage_reset := old.last_usage_reset;
      new.picks_score := old.picks_score;
      new.total_gain_pct := old.total_gain_pct;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns
  before insert or update on public.profiles
  for each row execute function public.protect_profile_columns();

commit;

-- Check: these are the only rules that should still be open to everyone.
-- ai_cache, badges, newsletter_digests, post_likes and posts, all SELECT.
select tablename, policyname, cmd, array_to_string(roles, ', ') as applies_to
from pg_policies
where schemaname = 'public'
  and permissive = 'PERMISSIVE'
  and (qual = 'true' or with_check = 'true')
order by 1, 2;
