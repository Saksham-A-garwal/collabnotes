import { ApiError, canEditContent, type DocumentSummary, type SnapshotSummary } from "@collabnotes/shared";
import { findDocumentById, toDocumentSummary } from "../../db/queries/documents.js";
import { findSnapshotById, listSnapshots, toSnapshotSummary } from "../../db/queries/snapshots.js";
import { getRoomManager } from "../../realtime/index.js";
import { getDocumentForUser } from "../documents/documents.service.js";

// FR-24: Owner/Editor/Viewer can all view version history (SRS §3's role
// table — no restriction here, unlike restore).
export async function listSnapshotsForUser(documentId: string, userId: string): Promise<SnapshotSummary[]> {
  await getDocumentForUser(documentId, userId); // access check only; role unused here
  const rows = await listSnapshots(documentId);
  return rows.map(toSnapshotSummary);
}

// FR-25/FR-26: Owner/Editor can restore; Commenter and Viewer cannot (restoring rewrites content).
export async function restoreSnapshotForUser(
  documentId: string,
  userId: string,
  snapshotId: string,
): Promise<DocumentSummary> {
  const { role } = await getDocumentForUser(documentId, userId);
  if (!canEditContent(role)) {
    throw new ApiError("FORBIDDEN", "Only owners and editors can restore a version.");
  }

  const snapshot = await findSnapshotById(documentId, snapshotId);
  if (!snapshot) throw new ApiError("DOCUMENT_NOT_FOUND", "Snapshot not found.");

  await getRoomManager().restoreSnapshot(documentId, snapshot.state_data, userId);

  const doc = await findDocumentById(documentId);
  if (!doc) throw new ApiError("DOCUMENT_NOT_FOUND", "Document not found.");
  return toDocumentSummary(doc, role);
}
