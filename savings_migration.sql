/* Savings: two new household categories, interest paid to you and the
   resident withholding tax (RWT) taken from it, plus a place for each person's
   Savings page settings.

   - "Interest" and "Withholding tax" become default categories, so everyone
     has them (new sign-ups and existing accounts) and the shared list can use them.
   - The shared list matches the clearest bank wording: "credit interest",
     "interest credit" and "withholding tax". Uncategorised transactions that
     already say so are categorised now: interest only when money came in, tax
     only when it went out, and never on business accounts.
   - profiles.savings_prefs keeps the Savings page's choices (RWT rate, how much
     you add, expected returns). Saved by the person's own profile update.

   Safe to run more than once. */

begin;

/* 1. The default category lists, here and in backend/src/services/sharedCategories.ts. */
create or replace function public.is_default_category(cat_name text, cat_scope text)
returns boolean
language sql
immutable
as $$
  select (cat_scope = 'household' and cat_name in ('Groceries', 'Rent/Mortgage', 'Utilities', 'Transport', 'Dining Out',
            'Entertainment', 'Subscriptions', 'Health & Wellness', 'Shopping', 'Insurance', 'Savings', 'Income',
            'Interest', 'Withholding tax', 'Miscellaneous'))
      or (cat_scope = 'business' and cat_name in ('Sales', 'Materials', 'Subcontractors', 'Vehicle', 'Tools & Equipment',
            'Software', 'Office', 'Insurance', 'Accounting', 'Tax', 'Drawings', 'Miscellaneous'));
$$;

create or replace function public.seed_fin_categories(target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.fin_categories (user_id, name, scope)
  select target, c.name, c.scope
  from (values
    ('Groceries', 'household'), ('Rent/Mortgage', 'household'), ('Utilities', 'household'),
    ('Transport', 'household'), ('Dining Out', 'household'), ('Entertainment', 'household'),
    ('Subscriptions', 'household'), ('Health & Wellness', 'household'), ('Shopping', 'household'),
    ('Insurance', 'household'), ('Savings', 'household'), ('Income', 'household'),
    ('Interest', 'household'), ('Withholding tax', 'household'),
    ('Miscellaneous', 'household'),
    ('Sales', 'business'), ('Materials', 'business'), ('Subcontractors', 'business'),
    ('Vehicle', 'business'), ('Tools & Equipment', 'business'), ('Software', 'business'),
    ('Office', 'business'), ('Insurance', 'business'), ('Accounting', 'business'),
    ('Tax', 'business'), ('Drawings', 'business'), ('Miscellaneous', 'business')
  ) as c(name, scope)
  on conflict (user_id, name, scope) do nothing;
$$;
revoke all on function public.seed_fin_categories(uuid) from public, anon, authenticated;

/* 2. Everyone who already has categories gets the two new ones. */
insert into public.fin_categories (user_id, name, scope)
select distinct c.user_id, n.name, 'household'
from public.fin_categories c
cross join (values ('Interest'), ('Withholding tax')) as n(name)
where c.scope = 'household' and c.user_id is not null
on conflict (user_id, name, scope) do nothing;

/* 3. Shared matches for the clearest wording. */
insert into public.shared_category_matches (keyword, category_name, scope, status, source, reviewed_at)
values
  ('credit interest', 'Interest', 'household', 'approved', 'starter', now()),
  ('interest credit', 'Interest', 'household', 'approved', 'starter', now()),
  ('withholding tax', 'Withholding tax', 'household', 'approved', 'starter', now())
on conflict (keyword, scope, category_name) do update set status = 'approved', reviewed_at = now();

/* 4. Uncategorised transactions that already match. */
update public.fin_transactions t
set category_id = c.id, category_source = 'shared', shared_match_id = s.id
from public.shared_category_matches s, public.fin_categories c, public.fin_accounts a
where t.category_id is null
  and s.status = 'approved' and s.scope = 'household'
  and s.keyword in ('credit interest', 'interest credit', 'withholding tax')
  and t.description ilike '%' || s.keyword || '%'
  and ((s.category_name = 'Interest' and t.amount > 0) or (s.category_name = 'Withholding tax' and t.amount < 0))
  and c.user_id = t.user_id and c.name = s.category_name and c.scope = 'household'
  and a.id = t.account_id and not coalesce(a.is_business, false)
  and not exists (select 1 from public.fin_category_optouts o where o.user_id = t.user_id and o.match_id = s.id);

/* 5. Savings page settings. */
alter table public.profiles add column if not exists savings_prefs jsonb not null default '{}'::jsonb;
alter table public.profiles drop constraint if exists profiles_savings_prefs_object;
alter table public.profiles add constraint profiles_savings_prefs_object
  check (jsonb_typeof(savings_prefs) = 'object' and pg_column_size(savings_prefs) < 2000);

commit;
