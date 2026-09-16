import * as Y from "yjs";
import { pool } from "../db/pool.js";

// Rebuilds a document's Yjs state: latest snapshot (if any) plus only the
// updates created *after* that snapshot's cutoff (last_update_id). Before
// Phase 3 this replayed the entire update log every time, which was safe
// (Yjs merges are idempotent) but would have silently undone a restore —
// replaying pre-restore updates back on top of a post-restore snapshot
// would re-merge the abandoned content in. The cutoff is what makes
// restore actually stick.
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

// FR-13/Architecture §6.1 step 5: append-only, never blocks the relay path.
export async function appendUpdate(documentId: string, update: Uint8Array): Promise<void> {
  await pool.query("INSERT INTO document_updates (document_id, update_data) VALUES ($1, $2)", [
    documentId,
    Buffer.from(update),
  ]);
}

// Architecture §6.2, simplified: rather than re-deriving state by replaying
// document_updates from scratch, this snapshots the room's already-live
// Y.Doc directly — the room manager keeps it current with every applied
// update anyway, so re-deriving it would just recompute the same result
// less efficiently. Captures the current max update id as the new cutoff.
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
