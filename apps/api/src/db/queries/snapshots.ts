import type { SnapshotSummary } from "@collabnotes/shared";
import { pool } from "../pool.js";

export type SnapshotRow = {
  id: string;
  document_id: string;
  state_data: Buffer;
  triggered_by: string | null;
  triggered_by_name: string | null;
  last_update_id: string | null;
  created_at: Date;
};

export function toSnapshotSummary(row: SnapshotRow): SnapshotSummary {
  return {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    triggeredBy:
      row.triggered_by && row.triggered_by_name
        ? { userId: row.triggered_by, displayName: row.triggered_by_name }
        : "auto",
  };
}

export async function listSnapshots(documentId: string): Promise<SnapshotRow[]> {
  const result = await pool.query<SnapshotRow>(
    `SELECT s.*, u.display_name AS triggered_by_name
     FROM document_snapshots s
     LEFT JOIN users u ON u.id = s.triggered_by
     WHERE s.document_id = $1
     ORDER BY s.created_at DESC`,
    [documentId],
  );
  return result.rows;
}

export async function findSnapshotById(
  documentId: string,
  snapshotId: string,
): Promise<SnapshotRow | null> {
  const result = await pool.query<SnapshotRow>(
    `SELECT s.*, u.display_name AS triggered_by_name
     FROM document_snapshots s
     LEFT JOIN users u ON u.id = s.triggered_by
     WHERE s.id = $1 AND s.document_id = $2`,
    [snapshotId, documentId],
  );
  return result.rows[0] ?? null;
}
