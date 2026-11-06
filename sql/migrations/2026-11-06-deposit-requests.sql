-- Industrial Commercial Bank — client deposit requests + USD default (2026-11-06).
--
-- Run this in the Neon SQL editor (project industrial-commercial-bank,
-- database bank) BEFORE, or at the same time as, deploying the matching
-- code. It is safe to run twice: the table uses IF NOT EXISTS and the
-- default change is idempotent.
--
-- deposit_requests: a signed-in client types the amount they want to
--   deposit (amount + currency + method + optional note) from their
--   client area. The request waits for the bank: staff approve or refuse
--   it in the dashboard. Approving credits the account balance and
--   records a deposit transaction; the client then sees the new balance
--   and the deposit in their transaction history. RECORD-KEEPING ONLY:
--   no money ever moves through this site.
-- accounts currency default: new accounts now default to USD instead
--   of XAF. Existing accounts keep their currency — this changes only
--   the column default, never stored values.
--
-- Until this migration has run, the new code keeps working except for
-- the deposit-request paths: a client deposit request fails with a clear
-- error naming the missing table, and the staff "Dépôts" tab shows a
-- note pointing at this file instead of a list.

CREATE TABLE IF NOT EXISTS deposit_requests (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reference VARCHAR(20) NOT NULL UNIQUE,
  amount NUMERIC(19,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  method VARCHAR(20) NOT NULL DEFAULT 'bank_transfer'
    CHECK (method IN ('bank_transfer', 'cash', 'mobile_money', 'other')),
  note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS deposit_requests_account_id_idx
  ON deposit_requests (account_id);

CREATE INDEX IF NOT EXISTS deposit_requests_status_idx
  ON deposit_requests (status);

ALTER TABLE accounts ALTER COLUMN currency SET DEFAULT 'USD';
