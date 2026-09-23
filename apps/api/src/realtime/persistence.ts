import * as Y from "yjs";
import { pool } from "../db/pool.js";

export async function hydrateDocument(documentId: string): Promise<Y.Doc> {
  const doc = new Y.Doc();

  const snapshotResult = await pool.query<{ state_data: Buffer; last_update_id: string | null }>(
    "SELECT state_data, last_update_id FROM document_snapshots WHERE document_id = $1 ORDER BY created_at DESC LIMIT 1",
    [documentId],
  );
  const snapshot = snapshotResult.rows[0];
  if (snapshot) Y.applyUpdate(doc, snapshot.state_data);

  const cutoff = snapshot?.last_update_id ?? "0";
  const updatesResult = await pool.query<{ update_data: Buffer }>(
    "SELECT update_data FROM document_updates WHERE document_id = $1 AND id > $2 ORDER BY id ASC",
    [documentId, cutoff],
  );
  for (const row of updatesResult.rows) Y.applyUpdate(doc, row.update_data);

  return doc;
}

export async function appendUpdate(documentId: string, update: Uint8Array): Promise<void> {
  await pool.query("INSERT INTO document_updates (document_id, update_data) VALUES ($1, $2)", [
    documentId,
    Buffer.from(update),
  ]);
}

export async function createSnapshot(
  documentId: string,
  doc: Y.Doc,
  triggeredBy: string | null,
): Promise<void> {
  const maxIdResult = await pool.query<{ max: string | null }>(
    "SELECT MAX(id)::text AS max FROM document_updates WHERE document_id = $1",
    [documentId],
  );
  const lastUpdateId = maxIdResult.rows[0]?.max ?? null;
  const stateData = Buffer.from(Y.encodeStateAsUpdate(doc));

  await pool.query(
    `INSERT INTO document_snapshots (document_id, state_data, triggered_by, last_update_id)
     VALUES ($1, $2, $3, $4)`,
    [documentId, stateData, triggeredBy, lastUpdateId],
  );
}
