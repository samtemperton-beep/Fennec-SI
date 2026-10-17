-- ── Dashboard layout: which cards show and in what order ─────────────────────
-- Run in the Fennec SI Supabase SQL editor. Safe to re-run. Additive.
-- Shape: [{ "id": "networth", "hidden": false }, ...]. Null = default layout.
alter table public.profiles
  add column if not exists dashboard_layout jsonb;
