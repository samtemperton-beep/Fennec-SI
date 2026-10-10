-- ── KiwiSaver settings & balance tracking ────────────────────────────────────
-- Run this in the Fennec SI Supabase project (vgvcyopwmczkrpkvarpy)

CREATE TABLE IF NOT EXISTS fin_kiwisaver (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  -- Provider & balance
  provider           text,
  fund_type          text DEFAULT 'balanced',  -- conservative | balanced | growth | aggressive
  current_balance    numeric(14,2) DEFAULT 0,
  akahu_account_id   text,                     -- set if synced via Akahu
  -- Personal details for projections
  date_of_birth      date,
  retirement_age     int DEFAULT 65,
  -- Contribution rates
  annual_salary      numeric(14,2),
  employee_rate      numeric(5,2) DEFAULT 3,   -- 3 | 4 | 6 | 8 | 10 %
  employer_rate      numeric(5,2) DEFAULT 3,   -- minimum 3%
  voluntary_monthly  numeric(10,2) DEFAULT 0,  -- extra monthly top-up
  -- Return assumption
  expected_return    numeric(5,2) DEFAULT 5,   -- % per year
  -- Timestamps
  last_updated       timestamptz DEFAULT now(),
  created_at         timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE fin_kiwisaver ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own kiwisaver"
  ON fin_kiwisaver
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS fin_kiwisaver_user_idx ON fin_kiwisaver (user_id);
