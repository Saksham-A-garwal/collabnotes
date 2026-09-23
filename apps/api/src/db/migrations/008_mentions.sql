ALTER TABLE users ADD COLUMN email_mentions BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('mention')),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  thread_id   UUID NOT NULL REFERENCES comment_threads(id) ON DELETE CASCADE,
  comment_id  UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ
);

CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
