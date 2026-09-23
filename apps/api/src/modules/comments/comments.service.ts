import {
  ApiError,
  canComment,
  MAX_COMMENTS_PER_THREAD,
  MAX_THREADS_PER_DOCUMENT,
  type CommentAnchor,
  type CommentPerson,
  type CommentThreadDTO,
} from "@collabnotes/shared";
import {
  addComment,
  countComments,
  countThreads,
  createThreadWithComment,
  deleteComment,
  deleteThread,
  findComment,
  getThread,
  listPeople,
  listThreads,
  setThreadResolved,
  updateCommentBody,
} from "../../db/queries/comments.js";
import { getRoomManager } from "../../realtime/index.js";
import { findUserById } from "../../db/queries/users.js";
import { getDocumentForUser } from "../documents/documents.service.js";
import { notifyMentions } from "./mentionNotifier.js";

async function requireCommenter(documentId: string, userId: string) {
  const access = await getDocumentForUser(documentId, userId);
  if (!canComment(access.role)) {
    throw new ApiError("FORBIDDEN", "You don't have permission to comment on this document.");
  }
  return access;
}

async function loadThread(documentId: string, threadId: string): Promise<CommentThreadDTO> {
  const thread = await getThread(threadId);
  if (!thread || thread.documentId !== documentId) {
    throw new ApiError("DOCUMENT_NOT_FOUND", "That comment thread doesn't exist.");
  }
  return thread;
}

async function announce(documentId: string, thread: CommentThreadDTO): Promise<void> {
  try {
    await getRoomManager().broadcastThreadUpserted(documentId, thread);
  } catch (err) {
    console.warn(JSON.stringify({ level: "warn", message: "comment broadcast failed", documentId, error: (err as Error).message }));
  }
}

async function resolveMentions(documentId: string, authorId: string, requested: string[]): Promise<string[]> {
  if (requested.length === 0) return [];
  const allowed = new Set((await listPeople(documentId)).map((p) => p.id));
  return [...new Set(requested)].filter((id) => id !== authorId && allowed.has(id));
}

function announceMentions(params: {
  documentId: string;
  documentTitle: string;
  thread: CommentThreadDTO;
  commentId: string;
  authorId: string;
  body: string;
  userIds: string[];
}): void {
  if (params.userIds.length === 0) return;
  void (async () => {
    const author = await findUserById(params.authorId);
    await notifyMentions({
      documentId: params.documentId,
      documentTitle: params.documentTitle,
      threadId: params.thread.id,
      commentId: params.commentId,
      author: { id: params.authorId, name: author?.display_name ?? "Someone" },
      quote: params.thread.quote,
      body: params.body,
      userIds: params.userIds,
    });
  })().catch((err) =>
    console.error(JSON.stringify({ level: "error", message: "mention handling failed", documentId: params.documentId, error: (err as Error).message })),
  );
}

export async function listMentionable(documentId: string, userId: string): Promise<CommentPerson[]> {
  await getDocumentForUser(documentId, userId);
  return listPeople(documentId);
}

export async function listComments(documentId: string, userId: string): Promise<CommentThreadDTO[]> {
  await getDocumentForUser(documentId, userId);
  return listThreads(documentId);
}

export async function createComment(
  documentId: string,
  userId: string,
  input: { quote: string; anchor: CommentAnchor | null; body: string; mentions: string[] },
): Promise<CommentThreadDTO> {
  const { doc } = await requireCommenter(documentId, userId);
  if ((await countThreads(documentId)) >= MAX_THREADS_PER_DOCUMENT) {
    throw new ApiError("RATE_LIMITED", `This document has reached its limit of ${MAX_THREADS_PER_DOCUMENT} comment threads.`);
  }
  const mentions = await resolveMentions(documentId, userId, input.mentions);
  const { threadId, commentId } = await createThreadWithComment({ documentId, authorId: userId, ...input, mentions });
  const thread = (await getThread(threadId))!;
  await announce(documentId, thread);
  announceMentions({ documentId, documentTitle: doc.title, thread, commentId, authorId: userId, body: input.body, userIds: mentions });
  return thread;
}

export async function replyToThread(
  documentId: string,
  userId: string,
  threadId: string,
  body: string,
  requestedMentions: string[],
): Promise<CommentThreadDTO> {
  const { doc } = await requireCommenter(documentId, userId);
  await loadThread(documentId, threadId);
  if ((await countComments(threadId)) >= MAX_COMMENTS_PER_THREAD) {
    throw new ApiError("RATE_LIMITED", `This thread has reached its limit of ${MAX_COMMENTS_PER_THREAD} comments.`);
  }
  const mentions = await resolveMentions(documentId, userId, requestedMentions);
  const commentId = await addComment({ threadId, authorId: userId, body, mentions });
  const thread = (await getThread(threadId))!;
  await announce(documentId, thread);
  announceMentions({ documentId, documentTitle: doc.title, thread, commentId, authorId: userId, body, userIds: mentions });
  return thread;
}

export async function setResolved(documentId: string, userId: string, threadId: string, resolved: boolean): Promise<CommentThreadDTO> {
  await requireCommenter(documentId, userId);
  await loadThread(documentId, threadId);
  await setThreadResolved(threadId, resolved ? userId : null);
  const thread = (await getThread(threadId))!;
  await announce(documentId, thread);
  return thread;
}

export async function editComment(
  documentId: string,
  userId: string,
  threadId: string,
  commentId: string,
  body: string,
  requestedMentions: string[],
): Promise<CommentThreadDTO> {
  const { doc } = await requireCommenter(documentId, userId);
  await loadThread(documentId, threadId);
  const comment = await findComment(threadId, commentId);
  if (!comment) throw new ApiError("DOCUMENT_NOT_FOUND", "That comment doesn't exist.");
  if (comment.author_id !== userId) throw new ApiError("FORBIDDEN", "You can only edit your own comments.");
  const mentions = await resolveMentions(documentId, userId, requestedMentions);
  await updateCommentBody(commentId, body, mentions);
  const thread = (await getThread(threadId))!;
  await announce(documentId, thread);
  const added = mentions.filter((id) => !comment.mentions.includes(id));
  announceMentions({ documentId, documentTitle: doc.title, thread, commentId, authorId: userId, body, userIds: added });
  return thread;
}

export async function removeComment(documentId: string, userId: string, threadId: string, commentId: string): Promise<CommentThreadDTO> {
  const { role } = await getDocumentForUser(documentId, userId);
  await loadThread(documentId, threadId);
  const comment = await findComment(threadId, commentId);
  if (!comment) throw new ApiError("DOCUMENT_NOT_FOUND", "That comment doesn't exist.");
  if (comment.author_id !== userId && role !== "owner") {
    throw new ApiError("FORBIDDEN", "You can only delete your own comments.");
  }
  if (comment.is_first) {
    throw new ApiError("VALIDATION_ERROR", "That's the start of the thread. Delete the whole thread instead.");
  }
  await deleteComment(commentId);
  const thread = (await getThread(threadId))!;
  await announce(documentId, thread);
  return thread;
}

export async function removeThread(documentId: string, userId: string, threadId: string): Promise<void> {
  const { role } = await getDocumentForUser(documentId, userId);
  const thread = await loadThread(documentId, threadId);
  if (thread.author.id !== userId && role !== "owner") {
    throw new ApiError("FORBIDDEN", "You can only delete threads you started.");
  }
  await deleteThread(threadId);
  try {
    await getRoomManager().broadcastThreadDeleted(documentId, threadId);
  } catch (err) {
    console.warn(JSON.stringify({ level: "warn", message: "comment broadcast failed", documentId, error: (err as Error).message }));
  }
}
