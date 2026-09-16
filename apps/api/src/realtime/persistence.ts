import * as Y from "yjs";
import { pool } from "../db/pool.js";

// Rebuilds a document's Yjs state from durable storage: latest snapshot (if
// any — Phase 3 adds the writer; this reader is forward-compatible with it
// already) plus every update since. Y.applyUpdate is idempotent for an
// update the snapshot already contains, so replaying the full log on top of
// a snapshot is always correct, just not maximally efficient yet
// (Architecture §6.2's compaction note covers trimming this later).
export async function hydrateDocument(documentId: string): Promise<Y.Doc> {
  const doc = new Y.Doc();

  const snapshotResult = await pool.query<{ state_data: Buffer }>(
    "SELECT state_data FROM document_snapshots WHERE document_id = $1 ORDER BY created_at DESC LIMIT 1",
    [documentId],
  );
  const snapshot = snapshotResult.rows[0];
  if (snapshot) Y.applyUpdate(doc, snapshot.state_data);

  const updatesResult = await pool.query<{ update_data: Buffer }>(
    "SELECT update_data FROM document_updates WHERE document_id = $1 ORDER BY id ASC",
    [documentId],
  );
  for (const row of updatesResult.rows) Y.applyUpdate(doc, row.update_data);

  return doc;
}

// FR-13/Architecture §6.1 step 5: append-only, async, never blocks the
// relay path (the caller awaits this before broadcasting only insofar as
// Postgres itself is fast — no artificial decoupling added here at this
// project's scale).
export async function appendUpdate(documentId: string, update: Uint8Array): Promise<void> {
  await pool.query("INSERT INTO document_updates (document_id, update_data) VALUES ($1, $2)", [
    documentId,
    Buffer.from(update),
  ]);
}
