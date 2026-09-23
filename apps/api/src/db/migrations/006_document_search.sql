ALTER TABLE documents ADD COLUMN search_text TEXT NOT NULL DEFAULT '';

ALTER TABLE documents ADD COLUMN search_indexed_at TIMESTAMPTZ;

ALTER TABLE documents ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(search_text, '')), 'B')
) STORED;

CREATE INDEX idx_documents_search_vector ON documents USING GIN (search_vector);
