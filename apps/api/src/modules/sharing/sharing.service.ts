import {
  ApiError,
  type DocumentAccessEntry,
  type DocumentSummary,
  type InviteNotification,
  type Role,
  type ShareLink,
} from "@collabnotes/shared";
import { env } from "../../config/env.js";
import { findDocumentById, getUserRole, toDocumentSummary, type DocumentRow } from "../../db/queries/documents.js";
import {
  findAccessByUserId,
  findPendingAccessByEmail,
  grantAccessByEmail,
  grantAccessToUser,
  listAccess,
  removeAccess,
  removeAccessByEmail,
  toAccessEntry,
} from "../../db/queries/sharing.js";
import { createShareLink, findShareLink, revokeShareLink } from "../../db/queries/shareLinks.js";
import { findUserByEmail, findUserById } from "../../db/queries/users.js";
import { getRoomManager } from "../../realtime/index.js";
import { getDocumentForUser } from "../documents/documents.service.js";
import { notifyInvitee } from "./inviteNotifier.js";

async function requireOwner(documentId: string, userId: string): Promise<DocumentRow> {
  const { doc, role } = await getDocumentForUser(documentId, userId);
  if (role !== "owner") {
    throw new ApiError("FORBIDDEN", "Only the document owner can manage sharing.");
  }
  return doc;
}

function frontendOrigin(): string {
  return env.CORS_ORIGIN.split(",")[0]!.trim();
}

export async function listAccessForOwner(documentId: string, ownerId: string): Promise<DocumentAccessEntry[]> {
  await requireOwner(documentId, ownerId);
  const rows = await listAccess(documentId);
  return rows.map(toAccessEntry);
}

export async function inviteByEmail(
  documentId: string,
  ownerId: string,
  email: string,
  role: Exclude<Role, "owner">,
  opts: { notify?: boolean } = {},
): Promise<{ entry: DocumentAccessEntry; notification: InviteNotification }> {
  const doc = await requireOwner(documentId, ownerId);

  const existingUser = await findUserByEmail(email);
  let entry: DocumentAccessEntry;
  let changed: boolean;

  if (existingUser) {
    if (existingUser.id === doc.owner_id) {
      throw new ApiError("VALIDATION_ERROR", "The owner already has access to this document.");
    }
    const previous = await findAccessByUserId(documentId, existingUser.id);
    const row = await grantAccessToUser(documentId, existingUser.id, role);
    getRoomManager().updateMemberRole(documentId, existingUser.id, role);
    entry = toAccessEntry({ ...row, display_name: existingUser.display_name, email: existingUser.email });
    changed = previous?.role !== role;
  } else {
    const previous = await findPendingAccessByEmail(documentId, email);
    entry = toAccessEntry(await grantAccessByEmail(documentId, email, role));
    changed = previous?.role !== role;
  }

  let notification: InviteNotification;
  if (!opts.notify) {
    notification = "not-requested";
  } else if (!changed) {
    notification = "unchanged";
  } else {
    const inviter = await findUserById(ownerId);
    notification = await notifyInvitee({
      documentId,
      documentTitle: doc.title,
      ownerId,
      inviterName: inviter?.display_name ?? "",
      email,
      role,
      recipientHasAccount: existingUser !== null,
    });
  }

  return { entry, notification };
}

export async function createLink(documentId: string, ownerId: string, role: Role): Promise<ShareLink> {
  await requireOwner(documentId, ownerId);
  const link = await createShareLink(documentId, role);
  return { token: link.token, role: link.role, url: `${frontendOrigin()}/share/${link.token}` };
}

export async function revokeLink(documentId: string, ownerId: string, token: string): Promise<void> {
  await requireOwner(documentId, ownerId);
  const revoked = await revokeShareLink(documentId, token);
  if (!revoked) throw new ApiError("DOCUMENT_NOT_FOUND", "Share link not found.");
}

export async function removeCollaborator(
  documentId: string,
  ownerId: string,
  targetUserId: string,
): Promise<void> {
  await requireOwner(documentId, ownerId);
  const removed = await removeAccess(documentId, targetUserId);
  if (!removed) throw new ApiError("DOCUMENT_NOT_FOUND", "Collaborator not found.");
  getRoomManager().kickUser(documentId, targetUserId, "Your access to this document was removed.");
}

export async function cancelPendingInvite(
  documentId: string,
  ownerId: string,
  email: string,
): Promise<void> {
  await requireOwner(documentId, ownerId);
  const removed = await removeAccessByEmail(documentId, email);
  if (!removed) throw new ApiError("DOCUMENT_NOT_FOUND", "Pending invite not found.");
}

export async function redeemShareLink(token: string, userId: string): Promise<DocumentSummary> {
  const link = await findShareLink(token);
  if (!link) throw new ApiError("SHARE_LINK_INVALID", "This link is no longer valid.");
  if (link.revoked) throw new ApiError("SHARE_LINK_REVOKED", "This link is no longer valid.");

  const doc = await findDocumentById(link.document_id);
  if (!doc) throw new ApiError("SHARE_LINK_INVALID", "This link is no longer valid.");

  if (doc.owner_id !== userId) {
    const existingRole = await getUserRole(link.document_id, userId);
    if (!existingRole) {
      await grantAccessToUser(link.document_id, userId, link.role);
    }
  }

  const role = (await getUserRole(link.document_id, userId)) ?? link.role;
  return toDocumentSummary(doc, role);
}
