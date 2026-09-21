import type { CommentAnchor, CommentThreadDTO, CommentsResponse } from "@collabnotes/shared";
import { apiFetch } from "./apiClient.js";

type ThreadResponse = { thread: CommentThreadDTO };
const base = (documentId: string) => `/documents/${documentId}/comments`;

export const commentsApi = {
  list: (documentId: string) => apiFetch<CommentsResponse>(base(documentId)),

  createThread: (documentId: string, input: { quote: string; anchor: CommentAnchor | null; body: string }) =>
    apiFetch<ThreadResponse>(base(documentId), { method: "POST", body: input }),

  reply: (documentId: string, threadId: string, body: string) =>
    apiFetch<ThreadResponse>(`${base(documentId)}/${threadId}/replies`, { method: "POST", body: { body } }),

  setResolved: (documentId: string, threadId: string, resolved: boolean) =>
    apiFetch<ThreadResponse>(`${base(documentId)}/${threadId}`, { method: "PATCH", body: { resolved } }),

  editComment: (documentId: string, threadId: string, commentId: string, body: string) =>
    apiFetch<ThreadResponse>(`${base(documentId)}/${threadId}/comments/${commentId}`, { method: "PATCH", body: { body } }),

  deleteComment: (documentId: string, threadId: string, commentId: string) =>
    apiFetch<ThreadResponse>(`${base(documentId)}/${threadId}/comments/${commentId}`, { method: "DELETE" }),

  deleteThread: (documentId: string, threadId: string) =>
    apiFetch<void>(`${base(documentId)}/${threadId}`, { method: "DELETE" }),
};
