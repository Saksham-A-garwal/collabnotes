import type { DocumentAccessEntry, Role } from "@collabnotes/shared";
import { pool } from "../pool.js";

export type AccessRow = {
  id: string;
  document_id: string;
  user_id: string | null;
  invited_email: string | null;
  role: "editor" | "viewer";
  invited_at: Date;
  display_name: string | null;
  email: string | null;
};

export function toAccessEntry(row: AccessRow): DocumentAccessEntry {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email ?? row.invited_email ?? "",
    role: row.role,
    invitedAt: row.invited_at.toISOString(),
    pending: row.user_id === null,
  };
}

export async function listAccess(documentId: string): Promise<AccessRow[]> {
  const result = await pool.query<AccessRow>(
    `SELECT da.*, u.display_name, u.email
     FROM document_access da
     LEFT JOIN users u ON u.id = da.user_id
     WHERE da.document_id = $1
     ORDER BY da.invited_at ASC`,
    [documentId],
  );
  return result.rows;
}

export async function findAccessByUserId(
  documentId: string,
  userId: string,
): Promise<AccessRow | null> {
  const result = await pool.query<AccessRow>(
    `SELECT da.*, u.display_name, u.email
     FROM document_access da
     LEFT JOIN users u ON u.id = da.user_id
     WHERE da.document_id = $1 AND da.user_id = $2`,
    [documentId, userId],
  );
  return result.rows[0] ?? null;
}

// Grants (or updates the role of) access for an existing user. Upsert, so
// re-inviting an existing collaborator with a different role is how a role
// change happens (SRS has no dedicated "change role" endpoint; UIUX §3.4's
// role dropdown reuses this).
export async function grantAccessToUser(
  documentId: string,
  userId: string,
  role: Role,
): Promise<AccessRow> {
  const result = await pool.query<AccessRow>(
    `INSERT INTO document_access (document_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (document_id, user_id) WHERE user_id IS NOT NULL
     DO UPDATE SET role = excluded.role
     RETURNING *`,
    [documentId, userId, role],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to grant access");
  return { ...row, display_name: null, email: null };
}

// FR-19: no account yet — recorded against the email, resolved by
// resolvePendingInvites once that email registers/logs in.
export async function grantAccessByEmail(
  documentId: string,
  email: string,
  role: Role,
): Promise<AccessRow> {
  const result = await pool.query<AccessRow>(
    `INSERT INTO document_access (document_id, invited_email, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (document_id, invited_email) WHERE invited_email IS NOT NULL
     DO UPDATE SET role = excluded.role
     RETURNING *`,
    [documentId, email, role],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to grant access");
  return { ...row, display_name: null, email };
}

export async function removeAccess(documentId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM document_access WHERE document_id = $1 AND user_id = $2",
    [documentId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

// Cancels a not-yet-resolved invite — not in SRS §5.3, but without it a
// mistyped or no-longer-wanted invite to someone with no account yet could
// never be undone (DELETE /access/:userId only matches resolved rows).
export async function removeAccessByEmail(documentId: string, email: string): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM document_access WHERE document_id = $1 AND invited_email = $2",
    [documentId, email],
  );
  return (result.rowCount ?? 0) > 0;
}

// Called when a new account is created (register or first-time OAuth), so
// any invite sent to that email before they had an account takes effect.
// The NOT EXISTS guard skips a row if that (document, user) grant somehow
// already exists (e.g. they were separately granted access directly) rather
// than violating the partial unique index.
export async function resolvePendingInvites(email: string, userId: string): Promise<void> {
  await pool.query(
    `UPDATE document_access
     SET user_id = $2, invited_email = NULL
     WHERE invited_email = $1
       AND user_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM document_access existing
         WHERE existing.document_id = document_access.document_id
           AND existing.user_id = $2
       )`,
    [email, userId],
  );
}
