-- ── Lock down akahu_credentials: tokens are written/read by the backend only ──
-- Run in the Fennec SI Supabase SQL editor (project: vgvcyopwmczkrpkvarpy).
-- Safe to re-run.
--
-- ORDER MATTERS. Run this LAST:
--   1. Generate a new key and set AKAHU_TOKEN_KEY on the backend (Railway).
--   2. Deploy the backend, then the frontend.
--   3. Run this file.
--   4. Backfill existing rows (optional; they also upgrade on next sync):
--        cd backend && npx ts-node src/scripts/encryptAkahuTokens.ts          # dry run
--        cd backend && npx ts-node src/scripts/encryptAkahuTokens.ts --apply
-- Running it before step 2 breaks the OLD frontend, which writes and reads the
-- token columns directly from the browser.

-- The browser used to upsert tokens straight into this table. Tokens are now
-- encrypted by the backend (service role, which bypasses RLS), so the browser
-- must not be able to write plaintext into it at all.
drop policy if exists "akahu_credentials_insert" on public.akahu_credentials;
drop policy if exists "akahu_credentials_update" on public.akahu_credentials;

-- ...and must not be able to read the token columns, encrypted or not. The
-- app only needs to know whether a row exists (the "Connected" indicator).
-- RLS is row-level, so this uses column privileges.
revoke select, insert, update on public.akahu_credentials from anon, authenticated;
grant select (user_id, last_synced_at, created_at, updated_at)
  on public.akahu_credentials to authenticated;

-- Left in place: the "select own row" and "delete own row" policies, so users
-- can still see that they're connected and can disconnect.

-- ── Optional, after the backfill reports 0 plaintext rows ───────────────────
-- Make it impossible for any code path to store a plaintext token again:
--
-- alter table public.akahu_credentials
--   add constraint akahu_tokens_must_be_encrypted
--   check (app_token like 'enc:v1:%' and user_token like 'enc:v1:%');
