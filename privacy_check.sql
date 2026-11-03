-- ── Privacy and admin check ─────────────────────────────────────────────────
-- Run in the Fennec SI Supabase SQL editor. Read-only: it changes nothing.
-- Each query shows its own results tab. What you want to see is noted above each one.

-- 1. Who is an admin. Expect exactly one row: your account.
select u.email, p.username, u.created_at
from public.profiles p join auth.users u on u.id = p.id
where p.is_admin;

-- 2. Tables anyone signed in could read in full because row rules are off.
--    Expect no rows.
select c.relname as table_without_row_rules
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;

-- 3. Rules open to everyone. Expect only SELECT on ai_cache, badges,
--    newsletter_digests, post_likes and posts (shared, non-personal content).
select tablename, policyname, cmd, array_to_string(roles, ', ') as applies_to
from pg_policies
where schemaname = 'public' and permissive = 'PERMISSIVE'
  and (qual = 'true' or with_check = 'true')
order by 1, 2;

-- 4. Rules that don't tie a row to the signed-in person. Expect only the
--    tables in step 3, plus restrictive rules (2FA and plan checks).
select tablename, policyname, cmd, permissive
from pg_policies
where schemaname = 'public'
  and coalesce(qual, '') || coalesce(with_check, '') !~ '(auth\.uid|my_partner|fin_goals|true)'
order by 1, 2;

-- 5. Views, which skip row rules unless set to run as the viewer.
--    Expect only leaderboard_profiles (username and performance only).
select c.relname as view_name,
       coalesce(array_to_string(c.reloptions, ','), '') like '%security_invoker=true%' as runs_as_viewer,
       has_table_privilege('authenticated', c.oid, 'select') as signed_in_can_read
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
order by 1;

-- 6. Functions that run with full rights and that the app can call.
--    Expect only functions that check auth.uid() themselves (my_partner,
--    shared_accounts, shared_transactions, delete_user_data, plan_allows, plan_limit,
--    mfa_satisfied and similar).
select p.proname as function_name
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and has_function_privilege('authenticated', p.oid, 'execute')
order by 1;
