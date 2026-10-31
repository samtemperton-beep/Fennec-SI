-- ── Lock portfolio verification to the backend ───────────────────────────────
-- Run in the Fennec SI Supabase SQL editor. Safe to re-run.
--
-- Portfolios are verified only by the Akahu sync, which runs on the backend with
-- the service role. Row level security lets a user edit their own holdings, so
-- without this they could set is_verified themselves with the public anon key.
--
--   - Browser sessions can never turn is_verified on.
--   - If a browser session changes the share count or buy price of a verified
--     holding, it stops being verified. Price refreshes don't affect it.
--   - The backend (service role) is untouched, so Akahu sync keeps verifying.

create or replace function public.protect_holding_verification()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_verified := false;
    elsif new.shares is distinct from old.shares or new.buy_price is distinct from old.buy_price then
      new.is_verified := false;
    else
      new.is_verified := old.is_verified;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_holding_verification on public.holdings;
create trigger protect_holding_verification
  before insert or update on public.holdings
  for each row execute function public.protect_holding_verification();

-- Users could also write their own "verified" record. Only the backend does now.
drop policy if exists "Users can insert own verifications" on public.portfolio_verifications;
