-- Categories you make yourself, and income kept out of the budget.
--
-- - fin_categories.kind: 'spending' (counted in your monthly budget) or
--   'income' (its monthly_budget is the income you expect; never counted as
--   spending). Income and Interest are income; everything else is spending.
-- - New sign-ups get the same kinds.
-- - People can already add their own categories (the table's policy lets each
--   person write their own rows); this only adds the kind.
--
-- Safe to run more than once.

begin;

alter table public.fin_categories add column if not exists kind text not null default 'spending';
alter table public.fin_categories drop constraint if exists fin_categories_kind_check;
alter table public.fin_categories add constraint fin_categories_kind_check check (kind in ('spending', 'income'));

update public.fin_categories set kind = 'income'
where scope = 'household' and name in ('Income', 'Interest') and kind <> 'income';

create or replace function public.seed_fin_categories(target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.fin_categories (user_id, name, scope, kind)
  select target, c.name, c.scope,
         case when c.scope = 'household' and c.name in ('Income', 'Interest') then 'income' else 'spending' end
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

commit;
