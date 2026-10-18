-- ── Two-factor at the database level ─────────────────────────────────────────
-- Run in the Fennec SI Supabase SQL editor (project: vgvcyopwmczkrpkvarpy).
-- Safe to re-run; re-run it after adding new tables.
--
-- The app and backend already require the 2FA code. This closes the last gap:
-- someone with a password but no code could otherwise query the database
-- directly with the public anon key. Once a user has a verified authenticator,
-- every RLS-protected table refuses their session until it has completed the
-- code step (the JWT's aal claim is 'aal2').
--
-- Unchanged:
--   - users without 2FA (no verified factor -> allowed as before)
--   - signed-out (anon) access, e.g. public leaderboard reads
--   - the backend's service-role key, which bypasses RLS (scheduled syncs etc.)
--
-- It's a RESTRICTIVE policy: it doesn't grant anything, it's ANDed with each
-- table's existing policies, so nothing becomes more visible than it was.

-- 1. True when this session is allowed through.
--    SECURITY DEFINER so it can read auth.mfa_factors, which the client can't.
create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;

revoke all on function public.mfa_satisfied() from public;
grant execute on function public.mfa_satisfied() to authenticated;

-- 2. Add the rule to every table in public that has RLS switched on.
--    (select ...) lets Postgres evaluate it once per query, not once per row.
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists "require 2fa when enrolled" on public.%I', t.relname);
    execute format(
      'create policy "require 2fa when enrolled" on public.%I as restrictive for all to authenticated '
      'using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()))',
      t.relname
    );
    raise notice 'protected: %', t.relname;
  end loop;
end $$;

-- 3. Check: tables in public WITHOUT row level security. Anything listed here
--    is readable by anyone with the anon key, 2FA or not. It should be empty;
--    if not, tell Claude which tables appear so policies can be added.
select c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;

-- ── To undo ──────────────────────────────────────────────────────────────────
-- do $$ declare t record; begin
--   for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--            where n.nspname = 'public' and c.relkind = 'r' loop
--     execute format('drop policy if exists "require 2fa when enrolled" on public.%I', t.relname);
--   end loop;
-- end $$;
-- drop function if exists public.mfa_satisfied();
