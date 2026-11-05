-- Industrial Commercial Bank — client portal migration (2026-11-05).
--
-- Run this in the Neon SQL editor (project industrial-commercial-bank,
-- database bank) BEFORE, or at the same time as, deploying the matching
-- code. It is safe to run twice: both statements use IF NOT EXISTS.
--
-- client_approved: true once the customer confirms one of their own
--   transfer requests in the client portal (client-account.html).
--   The bank still reviews the request afterwards in the staff dashboard.
-- is_manual_bank: true when the customer typed the destination bank
--   themselves because it was not on the published lists (transfers.html,
--   "My bank is not listed"). Staff see these requests labelled as
--   manually entered in the dashboard.
--
-- Until this migration has run, the new code keeps working except for the
-- two paths that need the columns: manual-bank transfer requests are
-- recorded without the flag, and client approval of a transfer request
-- fails with a clear error naming the missing column instead of recording
-- anything half-finished.

ALTER TABLE transfer_requests
  ADD COLUMN IF NOT EXISTS client_approved BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE transfer_requests
  ADD COLUMN IF NOT EXISTS is_manual_bank BOOLEAN NOT NULL DEFAULT FALSE;
