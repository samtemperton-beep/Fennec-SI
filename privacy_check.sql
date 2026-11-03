-- Privacy and admin check
-- Run in the Fennec SI Supabase SQL editor. Read-only: it changes nothing.
-- One results table. Every row's "status" should be OK; anything marked CHECK
-- needs a look.

with
admins as (
  select u.email from public.profiles p join auth.users u on u.id = p.id where p.is_admin
),
no_rules as (
  select c.relname::text as name
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
),
open_rules as (
  select tablename || ' (' || cmd || ')' as name, tablename, cmd
  from pg_policies
  where schemaname = 'public' and permissive = 'PERMISSIVE'
    and (qual = 'true' or with_check = 'true')
),
views as (
  select c.relname::text as name
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and has_table_privilege('authenticated', c.oid, 'select')
    and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=true%'
),
full_rights as (
  select p.proname::text as name
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'execute')
)
select '1. Admin accounts' as check_name,
       coalesce(string_agg(email, ', '), 'none') as found,
       case when count(*) = 1 then 'OK' else 'CHECK' end as status
from admins
union all
select '2. Tables with no row rules', coalesce(string_agg(name, ', '), 'none'),
       case when count(*) = 0 then 'OK' else 'CHECK' end
from no_rules
union all
select '3. Rules open to everyone', coalesce(string_agg(name, ', '), 'none'),
       case when bool_and(cmd = 'SELECT' and tablename in ('ai_cache', 'badges', 'newsletter_digests', 'post_likes', 'posts')) is not false then 'OK' else 'CHECK' end
from open_rules
union all
select '4. Views that skip row rules', coalesce(string_agg(name, ', '), 'none'),
       case when bool_and(name = 'leaderboard_profiles') is not false then 'OK' else 'CHECK' end
from views
union all
select '5. Full-rights functions the app can call', coalesce(string_agg(name, ', ' order by name), 'none'),
       case when bool_and(name in ('mfa_satisfied', 'my_partner', 'plan_allows', 'plan_limit', 'shared_accounts', 'shared_transactions')) is not false then 'OK' else 'CHECK' end
from full_rights;
