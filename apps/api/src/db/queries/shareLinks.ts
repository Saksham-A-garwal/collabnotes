import crypto from "node:crypto";
import type { Role } from "@collabnotes/shared";
import { pool } from "../pool.js";

export type ShareLinkRow = {
  token: string;
  document_id: string;
  role: "editor" | "commenter" | "viewer";
  created_at: Date;
  revoked: boolean;
};

export async function createShareLink(documentId: string, role: Role): Promise<ShareLinkRow> {
  const token = crypto.randomBytes(32).toString("hex");
  const result = await pool.query<ShareLinkRow>(
    "INSERT INTO share_links (token, document_id, role) VALUES ($1, $2, $3) RETURNING *",
    [token, documentId, role],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to create share link");
  return row;
}

export async function findShareLink(token: string): Promise<ShareLinkRow | null> {
  const result = await pool.query<ShareLinkRow>("SELECT * FROM share_links WHERE token = $1", [token]);
  return result.rows[0] ?? null;
}

export async function revokeShareLink(documentId: string, token: string): Promise<boolean> {
  const result = await pool.query(
    "UPDATE share_links SET revoked = true WHERE token = $1 AND document_id = $2",
    [token, documentId],
  );
  return (result.rowCount ?? 0) > 0;
}
