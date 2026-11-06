-- Industrial Commercial Bank — client form updates (2026-11-06).
--
-- Run this in the Neon SQL editor (project industrial-commercial-bank,
-- database bank) BEFORE, or at the same time as, deploying the matching
-- code. It is safe to run twice: every change uses IF NOT EXISTS.
--
-- What changes:
--   applications.country — country of residence, chosen from a dropdown
--     on the open-account form.
--   applications.parent_guardian_name — full name of the parent or legal
--     guardian, required when the applicant is under 17.
--   applications.parental_consent — true when that parent or guardian
--     approved the application. Under-17 applications without it are
--     rejected by the API.
--
-- Until this migration has run, the new code keeps working except for
-- the sign-up path: submissions fail with a clear error naming this
-- file, never a raw database error.

ALTER TABLE applications ADD COLUMN IF NOT EXISTS country TEXT;

ALTER TABLE applications ADD COLUMN IF NOT EXISTS parent_guardian_name TEXT;

ALTER TABLE applications ADD COLUMN IF NOT EXISTS parental_consent BOOLEAN NOT NULL DEFAULT FALSE;
