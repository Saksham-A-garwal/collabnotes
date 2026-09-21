-- Passwordless sign-in: an emailed one-time code replaces the password.
--
-- The code itself is never stored — only a keyed hash (HMAC, see
-- otp.service.ts). A 6-digit code is a tiny search space, so the real defences
-- are the ones below: short expiry, a hard cap on guesses per code, single
-- use, and rate limits per email / IP (all enforced in the service, with
-- `attempts` and `consumed_at` updated atomically).
CREATE TABLE login_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        CITEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,              -- set on success, on supersede, or when attempts run out
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Latest live code for this email" is the only lookup on the hot path.
CREATE INDEX idx_login_codes_email_created ON login_codes (email, created_at DESC);
CREATE INDEX idx_login_codes_expires ON login_codes (expires_at);

-- No passwords any more: remove the stored hashes outright rather than leave
-- dead credential material in the database. Accounts are matched by email, so
-- existing users simply sign in with a code instead.
ALTER TABLE users DROP COLUMN password_hash;
