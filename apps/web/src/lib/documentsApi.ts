import type { DocumentDetail, DocumentSummary, Role } from "@collabnotes/shared";
import { apiFetch } from "./apiClient.js";

export const documentsApi = {
  list: () => apiFetch<{ documents: DocumentSummary[] }>("/documents"),

  create: (title?: string) =>
    apiFetch<{ document: DocumentSummary }>("/documents", { method: "POST", body: { title } }),

  get: (id: string) =>
    apiFetch<{ document: DocumentDetail; role: Role }>(`/documents/${id}`),

  rename: (id: string, title: string) =>
    apiFetch<{ document: DocumentSummary }>(`/documents/${id}`, { method: "PATCH", body: { title } }),

  remove: (id: string) => apiFetch<void>(`/documents/${id}`, { method: "DELETE" }),
};
