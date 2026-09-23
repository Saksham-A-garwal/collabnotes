CREATE TABLE login_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        CITEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_login_codes_email_created ON login_codes (email, created_at DESC);
CREATE INDEX idx_login_codes_expires ON login_codes (expires_at);

ALTER TABLE users DROP COLUMN password_hash;
