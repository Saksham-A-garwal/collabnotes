import { useCallback, useEffect, useState } from "react";
import type { CommentAnchor, CommentThreadDTO } from "@collabnotes/shared";
import { commentsApi } from "../lib/commentsApi.js";
import type { ConnectionStatus, RealtimeProvider } from "../lib/realtimeProvider.js";

// Replace a thread if we have it, add it if we don't. Used for both the response to
// our own change and the same change arriving over the socket, so applying it twice
// is harmless.
export function upsertThread(threads: CommentThreadDTO[], thread: CommentThreadDTO): CommentThreadDTO[] {
  const next = threads.some((t) => t.id === thread.id) ? threads.map((t) => (t.id === thread.id ? thread : t)) : [...threads, thread];
  return next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// The document's comment threads: loaded over REST, kept live by socket events, and
// reloaded after every reconnect (events sent while we were away are gone, so a fresh
// list is the only way to be sure we haven't missed one).
export function useComments(documentId: string, provider: RealtimeProvider | null, status: ConnectionStatus) {
  const [threads, setThreads] = useState<CommentThreadDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (status !== "synced") return;
    let cancelled = false;
    commentsApi
      .list(documentId)
      .then(({ threads }) => {
        if (cancelled) return;
        setThreads(threads);
        setLoadError(false);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, status]);

  useEffect(() => {
    if (!provider) return;
    const offUpsert = provider.onThreadUpserted((thread) => setThreads((current) => upsertThread(current, thread)));
    const offDelete = provider.onThreadDeleted((threadId) => setThreads((current) => current.filter((t) => t.id !== threadId)));
    return () => {
      offUpsert();
      offDelete();
    };
  }, [provider]);

  const apply = useCallback((thread: CommentThreadDTO) => {
    setThreads((current) => upsertThread(current, thread));
    return thread;
  }, []);

  // Every action rejects with the API's error so the caller can show its message.
  const actions = {
    createThread: (input: { quote: string; anchor: CommentAnchor | null; body: string }) =>
      commentsApi.createThread(documentId, input).then(({ thread }) => apply(thread)),
    reply: (threadId: string, body: string) => commentsApi.reply(documentId, threadId, body).then(({ thread }) => apply(thread)),
    setResolved: (threadId: string, resolved: boolean) =>
      commentsApi.setResolved(documentId, threadId, resolved).then(({ thread }) => apply(thread)),
    editComment: (threadId: string, commentId: string, body: string) =>
      commentsApi.editComment(documentId, threadId, commentId, body).then(({ thread }) => apply(thread)),
    deleteComment: (threadId: string, commentId: string) =>
      commentsApi.deleteComment(documentId, threadId, commentId).then(({ thread }) => apply(thread)),
    deleteThread: (threadId: string) =>
      commentsApi.deleteThread(documentId, threadId).then(() => setThreads((current) => current.filter((t) => t.id !== threadId))),
  };

  return { threads, loaded, loadError, ...actions };
}
