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
  quote        TEXT NOT NULL,
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
  mentions    UUID[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at   TIMESTAMPTZ
);
CREATE INDEX idx_comments_thread ON comments (thread_id, created_at);
