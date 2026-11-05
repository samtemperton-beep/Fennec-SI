-- Shared category list
-- Run in the Fennec SI Supabase SQL editor, after partner_sharing_migration.sql.
-- Safe to re-run.
--
-- A shared list of merchant keyword -> category name matches ("woolworths" ->
-- Groceries), so new people's transactions arrive already categorised.
--   - Matches are only used once an admin approves them on the admin page.
--   - Saving a rule suggests its keyword and category name. Nothing else about
--     the person or their transactions is stored, and only rules that use one of
--     the default category names count, so custom category names never leak.
--   - Each person's own rules still come first. Anyone can opt out of a shared
--     match, which clears it from their transactions and stops it applying.
--   - Matches map to each person's own category of that name; someone who has
--     renamed or deleted it just doesn't get the match.

begin;

-- 1. The default categories (seed_fin_categories), the only names the list uses.
create or replace function public.is_default_category(cat_name text, cat_scope text)
returns boolean
language sql
immutable
as $$
  select (cat_scope = 'household' and cat_name in ('Groceries', 'Rent/Mortgage', 'Utilities', 'Transport', 'Dining Out',
            'Entertainment', 'Subscriptions', 'Health & Wellness', 'Shopping', 'Insurance', 'Savings', 'Income', 'Miscellaneous'))
      or (cat_scope = 'business' and cat_name in ('Sales', 'Materials', 'Subcontractors', 'Vehicle', 'Tools & Equipment',
            'Software', 'Office', 'Insurance', 'Accounting', 'Tax', 'Drawings', 'Miscellaneous'));
$$;

-- 2. The list. Keywords are lower case, 3 to 40 characters, with no wildcards.
create table if not exists public.shared_category_matches (
  id uuid primary key default gen_random_uuid(),
  keyword text not null check (keyword = lower(btrim(keyword)) and length(keyword) between 3 and 40 and keyword !~ '[%_\\]'),
  category_name text not null,
  scope text not null default 'household' check (scope in ('household', 'business')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  source text not null default 'users' check (source in ('starter', 'admin', 'users')),
  suggestions integer not null default 0,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (keyword, scope, category_name),
  check (public.is_default_category(category_name, scope))
);
-- One approved category per keyword.
create unique index if not exists shared_category_matches_one_approved
  on public.shared_category_matches (keyword, scope) where status = 'approved';

alter table public.shared_category_matches enable row level security;
revoke all on public.shared_category_matches from anon, authenticated;
grant select on public.shared_category_matches to authenticated;
drop policy if exists "Approved matches are readable" on public.shared_category_matches;
create policy "Approved matches are readable" on public.shared_category_matches
  for select to authenticated using (status = 'approved');

-- 3. Matches someone has opted out of.
create table if not exists public.fin_category_optouts (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  match_id uuid not null references public.shared_category_matches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, match_id)
);
alter table public.fin_category_optouts enable row level security;
revoke all on public.fin_category_optouts from anon;
grant select, insert, delete on public.fin_category_optouts to authenticated;
drop policy if exists "Own opt-outs" on public.fin_category_optouts;
create policy "Own opt-outs" on public.fin_category_optouts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "require 2fa when enrolled" on public.fin_category_optouts;
create policy "require 2fa when enrolled" on public.fin_category_optouts
  as restrictive for all to authenticated using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- 4. How each transaction was categorised, and by which shared match.
alter table public.fin_transactions add column if not exists category_source text
  check (category_source in ('rule', 'shared', 'manual'));
alter table public.fin_transactions add column if not exists shared_match_id uuid
  references public.shared_category_matches(id) on delete set null;
create index if not exists fin_transactions_shared_match_idx on public.fin_transactions (shared_match_id) where shared_match_id is not null;

-- 5. Categorise new transactions: the person's own rules, then the shared list.
--    Runs as the person inserting (or the backend), so it only sees their rows.
do $$
declare
  rule_col text := (
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_category_rules' and column_name in ('keyword', 'pattern')
    order by column_name limit 1
  );
begin
  execute format($f$
    create or replace function public.fin_apply_category_rule()
    returns trigger language plpgsql as $body$
    declare
      biz boolean;
      match_id uuid;
      cat_id uuid;
    begin
      if new.category_id is not null then
        return new;
      end if;

      select category_id into new.category_id
      from public.fin_category_rules
      where user_id = new.user_id
        and new.description ilike '%%' || %1$I || '%%'
      order by length(%1$I) desc
      limit 1;
      if new.category_id is not null then
        new.category_source := 'rule';
        return new;
      end if;

      select is_business into biz from public.fin_accounts where id = new.account_id;
      select s.id, c.id into match_id, cat_id
      from public.shared_category_matches s
      join public.fin_categories c
        on c.user_id = new.user_id and c.name = s.category_name and c.scope = s.scope
      where s.status = 'approved'
        and s.scope = case when coalesce(biz, false) then 'business' else 'household' end
        and new.description ilike '%%' || s.keyword || '%%'
        and not exists (select 1 from public.fin_category_optouts o where o.user_id = new.user_id and o.match_id = s.id)
      order by length(s.keyword) desc
      limit 1;
      if match_id is not null then
        new.category_id := cat_id;
        new.category_source := 'shared';
        new.shared_match_id := match_id;
      end if;
      return new;
    end;
    $body$
  $f$, rule_col);
end $$;

-- 6. Saving a rule suggests it to the shared list (keyword and category name only).
create or replace function public.suggest_shared_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kw text := lower(btrim(coalesce(to_jsonb(new) ->> 'pattern', to_jsonb(new) ->> 'keyword', '')));
  cat_name text;
  cat_scope text;
begin
  select name, scope into cat_name, cat_scope from public.fin_categories where id = new.category_id;
  -- Default categories only; skip anything that looks like an account or card number.
  if cat_name is null or not public.is_default_category(cat_name, cat_scope)
     or length(kw) not between 3 and 40 or kw ~ '[%_\\]' or kw !~ '[a-z]' or kw ~ '\d{5,}' then
    return new;
  end if;
  insert into public.shared_category_matches (keyword, category_name, scope, source, suggestions)
  values (kw, cat_name, cat_scope, 'users', 1)
  on conflict (keyword, scope, category_name)
  do update set suggestions = public.shared_category_matches.suggestions + 1;
  return new;
end;
$$;
revoke all on function public.suggest_shared_category() from public, anon, authenticated;

drop trigger if exists suggest_shared_category on public.fin_category_rules;
create trigger suggest_shared_category
  after insert on public.fin_category_rules
  for each row execute function public.suggest_shared_category();

-- 7. Apply an approved match to everyone's uncategorised transactions, or take
--    one back out. Backend only (the admin page).
create or replace function public.apply_shared_match(target uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.fin_transactions t
     set category_id = c.id, category_source = 'shared', shared_match_id = s.id
    from public.shared_category_matches s, public.fin_accounts a, public.fin_categories c
   where s.id = target
     and s.status = 'approved'
     and a.id = t.account_id
     and s.scope = case when a.is_business then 'business' else 'household' end
     and c.user_id = t.user_id and c.name = s.category_name and c.scope = s.scope
     and t.category_id is null
     and t.description ilike '%' || s.keyword || '%'
     and not exists (select 1 from public.fin_category_optouts o where o.user_id = t.user_id and o.match_id = s.id);
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.remove_shared_match(target uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.fin_transactions
     set category_id = null, category_source = null, shared_match_id = null
   where shared_match_id = target and category_source = 'shared';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.apply_shared_match(uuid) from public, anon, authenticated;
revoke all on function public.remove_shared_match(uuid) from public, anon, authenticated;
grant execute on function public.apply_shared_match(uuid) to service_role;
grant execute on function public.remove_shared_match(uuid) to service_role;

-- 8. A starter list of common New Zealand merchants, waiting for approval.
insert into public.shared_category_matches (keyword, category_name, scope, source) values
  ('woolworths', 'Groceries', 'household', 'starter'), ('countdown', 'Groceries', 'household', 'starter'),
  ('new world', 'Groceries', 'household', 'starter'), ('pak n save', 'Groceries', 'household', 'starter'),
  ('paknsave', 'Groceries', 'household', 'starter'), ('four square', 'Groceries', 'household', 'starter'),
  ('fresh choice', 'Groceries', 'household', 'starter'), ('supervalue', 'Groceries', 'household', 'starter'),
  ('farro', 'Groceries', 'household', 'starter'),
  ('z energy', 'Transport', 'household', 'starter'), ('bp connect', 'Transport', 'household', 'starter'),
  ('mobil', 'Transport', 'household', 'starter'), ('caltex', 'Transport', 'household', 'starter'),
  ('gull nz', 'Transport', 'household', 'starter'), ('waitomo', 'Transport', 'household', 'starter'),
  ('at hop', 'Transport', 'household', 'starter'), ('snapper', 'Transport', 'household', 'starter'),
  ('wilson parking', 'Transport', 'household', 'starter'), ('parkmate', 'Transport', 'household', 'starter'),
  ('mcdonalds', 'Dining Out', 'household', 'starter'), ('kfc', 'Dining Out', 'household', 'starter'),
  ('burger king', 'Dining Out', 'household', 'starter'), ('subway', 'Dining Out', 'household', 'starter'),
  ('domino', 'Dining Out', 'household', 'starter'), ('pizza hut', 'Dining Out', 'household', 'starter'),
  ('starbucks', 'Dining Out', 'household', 'starter'), ('uber eats', 'Dining Out', 'household', 'starter'),
  ('doordash', 'Dining Out', 'household', 'starter'), ('delivereasy', 'Dining Out', 'household', 'starter'),
  ('netflix', 'Subscriptions', 'household', 'starter'), ('spotify', 'Subscriptions', 'household', 'starter'),
  ('disney plus', 'Subscriptions', 'household', 'starter'), ('amazon prime', 'Subscriptions', 'household', 'starter'),
  ('apple.com/bill', 'Subscriptions', 'household', 'starter'), ('youtube premium', 'Subscriptions', 'household', 'starter'),
  ('mercury', 'Utilities', 'household', 'starter'), ('genesis energy', 'Utilities', 'household', 'starter'),
  ('contact energy', 'Utilities', 'household', 'starter'), ('meridian', 'Utilities', 'household', 'starter'),
  ('electric kiwi', 'Utilities', 'household', 'starter'), ('flick electric', 'Utilities', 'household', 'starter'),
  ('nova energy', 'Utilities', 'household', 'starter'), ('spark nz', 'Utilities', 'household', 'starter'),
  ('one nz', 'Utilities', 'household', 'starter'), ('2degrees', 'Utilities', 'household', 'starter'),
  ('slingshot', 'Utilities', 'household', 'starter'), ('watercare', 'Utilities', 'household', 'starter'),
  ('kmart', 'Shopping', 'household', 'starter'), ('the warehouse', 'Shopping', 'household', 'starter'),
  ('farmers', 'Shopping', 'household', 'starter'), ('briscoes', 'Shopping', 'household', 'starter'),
  ('noel leeming', 'Shopping', 'household', 'starter'), ('jb hi-fi', 'Shopping', 'household', 'starter'),
  ('harvey norman', 'Shopping', 'household', 'starter'), ('mighty ape', 'Shopping', 'household', 'starter'),
  ('rebel sport', 'Shopping', 'household', 'starter'), ('bunnings', 'Shopping', 'household', 'starter'),
  ('mitre 10', 'Shopping', 'household', 'starter'), ('temu', 'Shopping', 'household', 'starter'),
  ('chemist warehouse', 'Health & Wellness', 'household', 'starter'), ('unichem', 'Health & Wellness', 'household', 'starter'),
  ('life pharmacy', 'Health & Wellness', 'household', 'starter'), ('les mills', 'Health & Wellness', 'household', 'starter'),
  ('anytime fitness', 'Health & Wellness', 'household', 'starter'), ('snap fitness', 'Health & Wellness', 'household', 'starter'),
  ('aa insurance', 'Insurance', 'household', 'starter'), ('ami insurance', 'Insurance', 'household', 'starter'),
  ('state insurance', 'Insurance', 'household', 'starter'), ('tower insurance', 'Insurance', 'household', 'starter'),
  ('southern cross health', 'Insurance', 'household', 'starter'), ('partners life', 'Insurance', 'household', 'starter'),
  ('event cinemas', 'Entertainment', 'household', 'starter'), ('hoyts', 'Entertainment', 'household', 'starter'),
  ('reading cinemas', 'Entertainment', 'household', 'starter'), ('ticketek', 'Entertainment', 'household', 'starter'),
  ('ticketmaster', 'Entertainment', 'household', 'starter'), ('steamgames', 'Entertainment', 'household', 'starter'),
  ('xero', 'Software', 'business', 'starter'), ('myob', 'Software', 'business', 'starter'),
  ('microsoft', 'Software', 'business', 'starter'), ('google workspace', 'Software', 'business', 'starter'),
  ('inland revenue', 'Tax', 'business', 'starter'), ('placemakers', 'Materials', 'business', 'starter'),
  ('carters', 'Materials', 'business', 'starter'), ('itm building', 'Materials', 'business', 'starter')
on conflict (keyword, scope, category_name) do nothing;

-- 9. Suggestions from the rules people have already saved.
insert into public.shared_category_matches (keyword, category_name, scope, source, suggestions)
select kw, c.name, c.scope, 'users', count(*)
from (
  select lower(btrim(coalesce(to_jsonb(r) ->> 'pattern', to_jsonb(r) ->> 'keyword', ''))) as kw, r.category_id
  from public.fin_category_rules r
) r
join public.fin_categories c on c.id = r.category_id
where public.is_default_category(c.name, c.scope)
  and length(kw) between 3 and 40 and kw !~ '[%_\\]' and kw ~ '[a-z]' and kw !~ '\d{5,}'
group by kw, c.name, c.scope
on conflict (keyword, scope, category_name)
do update set suggestions = greatest(public.shared_category_matches.suggestions, excluded.suggestions);

commit;

-- Check: the pending list waiting on the admin page.
select source, count(*) from public.shared_category_matches where status = 'pending' group by source;
