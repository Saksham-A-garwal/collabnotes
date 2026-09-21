-- Comments: threads pinned to a passage of text, with replies and resolve/reopen.
-- Also adds a "commenter" role: someone who can read and discuss a document but
-- not change its content.

-- Widen the role checks (both created unnamed in 001, so Postgres named them
-- <table>_<column>_check).
ALTER TABLE document_access DROP CONSTRAINT document_access_role_check;
ALTER TABLE document_access
  ADD CONSTRAINT document_access_role_check CHECK (role IN ('editor', 'commenter', 'viewer'));

ALTER TABLE share_links DROP CONSTRAINT share_links_role_check;
ALTER TABLE share_links
  ADD CONSTRAINT share_links_role_check CHECK (role IN ('editor', 'commenter', 'viewer'));

CREATE TABLE comment_threads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  author_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The text that was selected. Kept so the thread still reads sensibly if its
  -- anchor is later lost (the text was deleted, or the document was restored).
  quote        TEXT NOT NULL,
  -- {from, to}: two Yjs relative positions as JSON. Stuck to the letters
  -- themselves, so they follow the text as others type around it — unlike a
  -- character offset, which any edit above it would invalidate. Opaque to the
  -- server; only the editor interprets them.
  anchor       JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_comment_threads_document ON comment_threads (document_id, created_at);

CREATE TABLE comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES comment_threads(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  -- Users @mentioned in the body (validated to be people with access).
  mentions    UUID[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at   TIMESTAMPTZ
);
CREATE INDEX idx_comments_thread ON comments (thread_id, created_at);
