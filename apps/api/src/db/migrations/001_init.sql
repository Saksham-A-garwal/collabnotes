-- Source of truth: 02-SRS.md §6

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT UNIQUE NOT NULL,
  password_hash   TEXT,                     -- NULL if OAuth-only account
  display_name    TEXT NOT NULL,
  avatar_url      TEXT,
  oauth_provider  TEXT,                     -- 'google', NULL if email/password account
  oauth_uid       TEXT,                     -- provider's user id, NULL if email/password account
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (oauth_provider, oauth_uid)
);

CREATE TABLE refresh_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id       UUID NOT NULL,            -- shared across a rotation chain
  token_hash      TEXT NOT NULL,            -- hash of the opaque token, never store raw
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ
);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);

CREATE TABLE documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL DEFAULT 'Untitled document',
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE document_access (
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, user_id)
);

CREATE TABLE share_links (
  token           TEXT PRIMARY KEY,          -- cryptographically random, >=128 bits
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked         BOOLEAN NOT NULL DEFAULT false
);

-- Append-only Yjs update log. Compacted periodically (see Architecture §6).
CREATE TABLE document_updates (
  id              BIGSERIAL PRIMARY KEY,
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  update_data     BYTEA NOT NULL,            -- Y.encodeStateAsUpdate() output for this delta
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_document_updates_doc ON document_updates(document_id, id);

-- Compacted full-state snapshots (also used for version history UI)
CREATE TABLE document_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  state_data      BYTEA NOT NULL,            -- full Y.encodeStateAsUpdate() snapshot
  triggered_by    UUID REFERENCES users(id), -- NULL = automatic
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_document_snapshots_doc ON document_snapshots(document_id, created_at DESC);
