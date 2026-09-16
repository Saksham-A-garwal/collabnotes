-- FR-19: "if the invited email has no account, access is granted pending
-- their first login/registration with that email." The original schema's
-- (document_id, user_id) primary key can't represent that — a PK column
-- can't be NULL in Postgres. This switches to a surrogate id, makes
-- user_id nullable, and adds invited_email for the pending case, with a
-- partial unique index per case (so a real grant and a pending invite for
-- the same document each stay unique on their own terms) plus a check that
-- every row is one or the other.
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
