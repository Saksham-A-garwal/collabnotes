import type { DocumentDetail, DocumentSummary, Role } from "@collabnotes/shared";
import { pool } from "../pool.js";

export type DocumentRow = {
  id: string;
  title: string;
  owner_id: string;
  created_at: Date;
  updated_at: Date;
};

export type DocumentListRow = {
  id: string;
  title: string;
  updated_at: Date;
  role: Role;
};

export function toDocumentSummary(row: DocumentListRow | DocumentRow, role: Role): DocumentSummary {
  return { id: row.id, title: row.title, updatedAt: row.updated_at.toISOString(), role };
}

export function toDocumentDetail(row: DocumentRow, role: Role): DocumentDetail {
  return {
    ...toDocumentSummary(row, role),
    createdAt: row.created_at.toISOString(),
    ownerId: row.owner_id,
  };
}

export async function createDocument(ownerId: string, title: string | undefined): Promise<DocumentRow> {
  const result = title
    ? await pool.query<DocumentRow>(
        "INSERT INTO documents (title, owner_id) VALUES ($1, $2) RETURNING *",
        [title, ownerId],
      )
    : await pool.query<DocumentRow>(
        "INSERT INTO documents (owner_id) VALUES ($1) RETURNING *",
        [ownerId],
      );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to create document");
  return row;
}

export async function findDocumentById(id: string): Promise<DocumentRow | null> {
  const result = await pool.query<DocumentRow>("SELECT * FROM documents WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function getUserRole(documentId: string, userId: string): Promise<Role | null> {
  const result = await pool.query<{ role: Role | null }>(
    `SELECT CASE WHEN d.owner_id = $2 THEN 'owner' ELSE da.role END AS role
     FROM documents d
     LEFT JOIN document_access da ON da.document_id = d.id AND da.user_id = $2
     WHERE d.id = $1`,
    [documentId, userId],
  );
  return result.rows[0]?.role ?? null;
}

export async function listDocumentsForUser(userId: string): Promise<DocumentListRow[]> {
  const result = await pool.query<DocumentListRow>(
    `SELECT * FROM (
       SELECT d.id, d.title, d.updated_at, 'owner'::text AS role
       FROM documents d WHERE d.owner_id = $1
       UNION
       SELECT d.id, d.title, d.updated_at, da.role
       FROM documents d
       JOIN document_access da ON da.document_id = d.id
       WHERE da.user_id = $1
     ) combined
     ORDER BY updated_at DESC`,
    [userId],
  );
  return result.rows;
}

export async function renameDocument(id: string, title: string): Promise<DocumentRow> {
  const result = await pool.query<DocumentRow>(
    "UPDATE documents SET title = $2, updated_at = now() WHERE id = $1 RETURNING *",
    [id, title],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Document not found during rename");
  return row;
}

export async function deleteDocument(id: string): Promise<void> {
  await pool.query("DELETE FROM documents WHERE id = $1", [id]);
}
