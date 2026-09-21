-- Full-text search over what is *inside* documents.
--
-- The database never holds a document as readable text: content lives as a
-- binary Yjs update log and snapshots. So the server extracts plain text
-- (realtime/extractText.ts) and keeps it here, shortly after people stop
-- editing. PostgreSQL's built-in full-text search does the rest — word
-- stemming ("plan" finds "planning"), ranking and highlighted snippets — with
-- no separate search service to run.

ALTER TABLE documents ADD COLUMN search_text TEXT NOT NULL DEFAULT '';

-- NULL = never indexed. It is also how the startup backfill finds documents
-- that existed before this migration.
ALTER TABLE documents ADD COLUMN search_indexed_at TIMESTAMPTZ;

-- Kept in step with title and search_text by the database itself, so a rename
-- is searchable immediately. A title match outranks a body match (weights A > B).
ALTER TABLE documents ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(search_text, '')), 'B')
) STORED;

CREATE INDEX idx_documents_search_vector ON documents USING GIN (search_vector);
