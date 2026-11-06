-- Industrial Commercial Bank — client PIN login (2026-11-06).
--
-- Run this in the Neon SQL editor (project industrial-commercial-bank,
-- database bank) BEFORE, or at the same time as, deploying the matching
-- code. It is safe to run twice: every change uses IF NOT EXISTS.
--
-- What changes: clients sign in with their email address and a 4-digit
-- PIN instead of account number + application reference + email.
--   applications.pin_hash — salted scrypt hash of the 4-digit PIN the
--     client chose when they applied. The PIN itself is never stored.
--   accounts.pin_hash — the same hash, copied onto the account when the
--     account is created (staff may set a different PIN at that point).
--   accounts.failed_login_attempts — counts wrong PINs for the account.
--   accounts.pin_locked_until — when set in the future, the account
--     cannot sign in until that time (15 minutes after 5 wrong PINs).
--
-- Until this migration has run, the new code keeps working except for
-- the PIN paths: sign-up, client sign-in and account creation fail with
-- a clear error naming this file, never a raw database error.

ALTER TABLE applications ADD COLUMN IF NOT EXISTS pin_hash TEXT;

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS pin_hash TEXT;

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;
