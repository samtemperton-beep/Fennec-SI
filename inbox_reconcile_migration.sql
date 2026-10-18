-- ── Email Inbox: direction, counterparty and bank reconciliation ─────────────
-- Run in the Fennec SI Supabase SQL editor. Safe to re-run. Additive only.
--
--   direction            'payable' (you owe it) or 'receivable' (you're owed it,
--                        e.g. a copy of an invoice your business sent)
--   counterparty         who you pay / who pays you (vendor stays as the sender)
--   email_date           when the email arrived; anchors transaction matching
--   matched_transaction_id / paid_date / matched_at
--                        the bank transaction that settled it
--   dismissed            hidden by the user, kept so a rescan doesn't bring it back

alter table public.gmail_scanned_items
  add column if not exists direction text not null default 'payable',
  add column if not exists counterparty text,
  add column if not exists email_date date,
  add column if not exists matched_transaction_id uuid,
  add column if not exists paid_date date,
  add column if not exists matched_at timestamptz,
  add column if not exists dismissed boolean not null default false;

do $$ begin
  alter table public.gmail_scanned_items
    add constraint gmail_scanned_items_direction_check check (direction in ('payable', 'receivable'));
exception when duplicate_object then null; end $$;
