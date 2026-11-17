-- Quiet shares: shares someone doesn't want stock alerts for (big moves from
-- the buy price, watchlist AI ratings, earnings reminders). Price alerts they
-- set themselves still fire. Codes are stored without the market suffix (FPH, not FPH.NZ).
alter table notification_prefs add column if not exists muted_tickers text[] not null default '{}';
