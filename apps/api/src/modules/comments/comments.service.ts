import {
  ApiError,
  canComment,
  MAX_COMMENTS_PER_THREAD,
  MAX_THREADS_PER_DOCUMENT,
  type CommentAnchor,
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
  listThreads,
  setThreadResolved,
  updateCommentBody,
} from "../../db/queries/comments.js";
import { getRoomManager } from "../../realtime/index.js";
import { getDocumentForUser } from "../documents/documents.service.js";

// Reading comments takes any access to the document; writing takes a role that can
// comment (owner, editor, commenter). Access is checked on every call, never
// remembered: a zero-access user gets 404, not 403, so a document's existence isn't
// confirmed to people who shouldn't know.
async function requireCommenter(documentId: string, userId: string) {
  const access = await getDocumentForUser(documentId, userId);
  if (!canComment(access.role)) {
    throw new ApiError("FORBIDDEN", "You don't have permission to comment on this document.");
  }
  return access;
}

// A thread id from the URL must belong to the document in the URL. Without this
// check, having comment rights on *any* document would let you touch threads on
// documents you have no access to just by guessing their ids.
async function loadThread(documentId: string, threadId: string): Promise<CommentThreadDTO> {
  const thread = await getThread(threadId);
  if (!thread || thread.documentId !== documentId) {
    throw new ApiError("DOCUMENT_NOT_FOUND", "That comment thread doesn't exist.");
  }
  return thread;
}

// Live delivery is a courtesy on top of the REST response, so a broadcast failure
// must never fail the request that already succeeded.
async function announce(documentId: string, thread: CommentThreadDTO): Promise<void> {
  try {
    await getRoomManager().broadcastThreadUpserted(documentId, thread);
  } catch (err) {
    console.warn(JSON.stringify({ level: "warn", message: "comment broadcast failed", documentId, error: (err as Error).message }));
  }
}

export async function listComments(documentId: string, userId: string): Promise<CommentThreadDTO[]> {
  await getDocumentForUser(documentId, userId);
  return listThreads(documentId);
}

export async function createComment(
  documentId: string,
  userId: string,
  input: { quote: string; anchor: CommentAnchor | null; body: string },
): Promise<CommentThreadDTO> {
  await requireCommenter(documentId, userId);
  if ((await countThreads(documentId)) >= MAX_THREADS_PER_DOCUMENT) {
    throw new ApiError("RATE_LIMITED", `This document has reached its limit of ${MAX_THREADS_PER_DOCUMENT} comment threads.`);
  }
  const threadId = await createThreadWithComment({ documentId, authorId: userId, ...input, mentions: [] });
  const thread = (await getThread(threadId))!;
  await announce(documentId, thread);
  return thread;
}

export async function replyToThread(documentId: string, userId: string, threadId: string, body: string): Promise<CommentThreadDTO> {
  await requireCommenter(documentId, userId);
  await loadThread(documentId, threadId);
  if ((await countComments(threadId)) >= MAX_COMMENTS_PER_THREAD) {
    throw new ApiError("RATE_LIMITED", `This thread has reached its limit of ${MAX_COMMENTS_PER_THREAD} comments.`);
  }
  await addComment({ threadId, authorId: userId, body, mentions: [] });
  const thread = (await getThread(threadId))!;
  await announce(documentId, thread);
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

// You can only edit your own words, and only while you can still comment.
export async function editComment(
  documentId: string,
  userId: string,
  threadId: string,
  commentId: string,
  body: string,
): Promise<CommentThreadDTO> {
  await requireCommenter(documentId, userId);
  await loadThread(documentId, threadId);
  const comment = await findComment(threadId, commentId);
  if (!comment) throw new ApiError("DOCUMENT_NOT_FOUND", "That comment doesn't exist.");
  if (comment.author_id !== userId) throw new ApiError("FORBIDDEN", "You can only edit your own comments.");
  await updateCommentBody(commentId, body, []);
  const thread = (await getThread(threadId))!;
  await announce(documentId, thread);
  return thread;
}

// The author can always remove what they wrote, and the document's owner can remove
// anything (moderation). Deleting a thread's first comment would leave a thread with
// no opening message, so that means deleting the whole thread instead.
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
