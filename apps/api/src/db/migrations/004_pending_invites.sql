ALTER TABLE document_access DROP CONSTRAINT document_access_pkey;
ALTER TABLE document_access ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE document_access ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE document_access ADD COLUMN invited_email CITEXT;
ALTER TABLE document_access
  ADD CONSTRAINT document_access_user_or_email_chk
  CHECK (user_id IS NOT NULL OR invited_email IS NOT NULL);

CREATE UNIQUE INDEX document_access_doc_user_uniq
  ON document_access (document_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX document_access_doc_email_uniq
  ON document_access (document_id, invited_email) WHERE invited_email IS NOT NULL;
