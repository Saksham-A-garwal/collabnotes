import { ApiError, type Role } from "@collabnotes/shared";
import {
  createDocument,
  deleteDocument as deleteDocumentRow,
  findDocumentById,
  getUserRole,
  listDocumentsForUser,
  renameDocument as renameDocumentRow,
  type DocumentListRow,
  type DocumentRow,
} from "../../db/queries/documents.js";
import { documentEvents } from "../../lib/events.js";

const DEFAULT_TITLE = "Untitled document";

function normalizeTitle(title: string | undefined): string | undefined {
  const trimmed = title?.trim();
  return trimmed ? trimmed : undefined;
}

export async function createDocumentForUser(
  ownerId: string,
  title: string | undefined,
): Promise<DocumentRow> {
  return createDocument(ownerId, normalizeTitle(title));
}

export async function listDocuments(userId: string): Promise<DocumentListRow[]> {
  return listDocumentsForUser(userId);
}

async function requireAccess(
  documentId: string,
  userId: string,
): Promise<{ doc: DocumentRow; role: Role }> {
  const doc = await findDocumentById(documentId);
  if (!doc) throw new ApiError("DOCUMENT_NOT_FOUND", "Document not found.");

  const role = await getUserRole(documentId, userId);
  if (!role) throw new ApiError("DOCUMENT_NOT_FOUND", "Document not found.");

  return { doc, role };
}

export async function getDocumentForUser(
  documentId: string,
  userId: string,
): Promise<{ doc: DocumentRow; role: Role }> {
  return requireAccess(documentId, userId);
}

export async function renameDocumentForUser(
  documentId: string,
  userId: string,
  title: string,
): Promise<DocumentRow> {
  const { role } = await requireAccess(documentId, userId);
  if (role !== "owner") {
    throw new ApiError("FORBIDDEN", "Only the document owner can rename it.");
  }
  return renameDocumentRow(documentId, normalizeTitle(title) ?? DEFAULT_TITLE);
}

export async function deleteDocumentForUser(documentId: string, userId: string): Promise<void> {
  const { role } = await requireAccess(documentId, userId);
  if (role !== "owner") {
    throw new ApiError("FORBIDDEN", "Only the document owner can delete it.");
  }
  await deleteDocumentRow(documentId);
  documentEvents.emit("document:deleted", documentId);
}
