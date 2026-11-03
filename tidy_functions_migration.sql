-- ── Switch off functions the app no longer calls ────────────────────────────
-- Run in the Fennec SI Supabase SQL editor, after partner_sharing_migration.sql.
-- Safe to re-run. Changes permissions only.
--
-- current_household_role, is_household_member and shares_household belonged to
-- the old single-household setup, which partner sharing replaced. handle_new_user
-- only runs when someone signs up, as a trigger, and never needs calling directly.
-- None of them leak data, but nothing signed in should be able to call them.

begin;

-- household_members is no longer used by the app, but its read rule still called
-- is_household_member(). Each person can now see only their own row.
drop policy if exists "household_members_select" on public.household_members;
create policy "household_members_select" on public.household_members
  for select to authenticated using (user_id = auth.uid());

-- Stop if a database rule still uses one, since revoking would break that rule.
do $$
declare
  hit text;
begin
  select string_agg(tablename || '.' || policyname, ', ') into hit
  from pg_policies
  where schemaname = 'public'
    and coalesce(qual, '') || coalesce(with_check, '') ~ '(current_household_role|is_household_member|shares_household)';
  if hit is not null then
    raise exception 'These rules still use the old household functions: %. Nothing was changed.', hit;
  end if;
end $$;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('current_household_role', 'is_household_member', 'shares_household', 'handle_new_user')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

commit;
