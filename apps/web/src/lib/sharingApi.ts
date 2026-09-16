import type { DocumentAccessEntry, DocumentSummary, Role, ShareLink } from "@collabnotes/shared";
import { apiFetch } from "./apiClient.js";

type ShareRole = Exclude<Role, "owner">;

export const sharingApi = {
  listAccess: (documentId: string) =>
    apiFetch<{ collaborators: DocumentAccessEntry[] }>(`/documents/${documentId}/access`),

  invite: (documentId: string, email: string, role: ShareRole) =>
    apiFetch<{ access: DocumentAccessEntry }>(`/documents/${documentId}/share/invite`, {
      method: "POST",
      body: { email, role },
    }),

  createLink: (documentId: string, role: ShareRole) =>
    apiFetch<ShareLink>(`/documents/${documentId}/share/link`, { method: "POST", body: { role } }),

  revokeLink: (documentId: string, token: string) =>
    apiFetch<void>(`/documents/${documentId}/share/link/${token}`, { method: "DELETE" }),

  removeAccess: (documentId: string, userId: string) =>
    apiFetch<void>(`/documents/${documentId}/access/${userId}`, { method: "DELETE" }),

  cancelPendingInvite: (documentId: string, email: string) =>
    apiFetch<void>(`/documents/${documentId}/share/invite/${encodeURIComponent(email)}`, {
      method: "DELETE",
    }),

  redeem: (token: string) =>
    apiFetch<{ document: DocumentSummary }>(`/share/${token}/redeem`, { method: "POST" }),
};
