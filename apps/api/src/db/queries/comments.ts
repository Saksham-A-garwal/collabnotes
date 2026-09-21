import type { CommentAnchor, CommentThreadDTO } from "@collabnotes/shared";
import { pool } from "../pool.js";

type CommentJson = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  mentions: string[];
  createdAt: string;
  editedAt: string | null;
};

type ThreadRow = {
  id: string;
  document_id: string;
  quote: string;
  anchor: CommentAnchor | null;
  created_at: Date;
  resolved_at: Date | null;
  author_id: string;
  author_name: string;
  resolver_id: string | null;
  resolver_name: string | null;
  comments: CommentJson[];
};

// A thread with all its comments and the display names of everyone involved, in
// one statement — so listing a document's threads is one round trip, not one per
// thread. json_agg keeps the comments in the order they were written.
const THREAD_SELECT = `
  SELECT t.id, t.document_id, t.quote, t.anchor, t.created_at, t.resolved_at,
         ua.id AS author_id, ua.display_name AS author_name,
         ur.id AS resolver_id, ur.display_name AS resolver_name,
         COALESCE(
           json_agg(
             json_build_object(
               'id', c.id, 'authorId', cu.id, 'authorName', cu.display_name,
               'body', c.body, 'mentions', c.mentions,
               'createdAt', c.created_at, 'editedAt', c.edited_at
             ) ORDER BY c.created_at, c.id
           ) FILTER (WHERE c.id IS NOT NULL),
           '[]'::json
         ) AS comments
  FROM comment_threads t
  JOIN users ua ON ua.id = t.author_id
  LEFT JOIN users ur ON ur.id = t.resolved_by
  LEFT JOIN comments c ON c.thread_id = t.id
  LEFT JOIN users cu ON cu.id = c.author_id
`;
const THREAD_GROUP = `GROUP BY t.id, ua.id, ur.id`;

const iso = (value: string | Date): string => new Date(value).toISOString();

export function toThreadDTO(row: ThreadRow): CommentThreadDTO {
  return {
    id: row.id,
    documentId: row.document_id,
    author: { id: row.author_id, displayName: row.author_name },
    quote: row.quote,
    anchor: row.anchor,
    createdAt: row.created_at.toISOString(),
    resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
    resolvedBy: row.resolver_id ? { id: row.resolver_id, displayName: row.resolver_name ?? "" } : null,
    comments: row.comments.map((c) => ({
      id: c.id,
      threadId: row.id,
      author: { id: c.authorId, displayName: c.authorName },
      body: c.body,
      mentions: c.mentions,
      createdAt: iso(c.createdAt),
      editedAt: c.editedAt ? iso(c.editedAt) : null,
    })),
  };
}

export async function listThreads(documentId: string): Promise<CommentThreadDTO[]> {
  const result = await pool.query<ThreadRow>(
    `${THREAD_SELECT} WHERE t.document_id = $1 ${THREAD_GROUP} ORDER BY t.created_at`,
    [documentId],
  );
  return result.rows.map(toThreadDTO);
}

export async function countThreads(documentId: string): Promise<number> {
  const result = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM comment_threads WHERE document_id = $1", [documentId]);
  return result.rows[0]!.n;
}

export async function countComments(threadId: string): Promise<number> {
  const result = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM comments WHERE thread_id = $1", [threadId]);
  return result.rows[0]!.n;
}

export async function getThread(threadId: string): Promise<CommentThreadDTO | null> {
  const result = await pool.query<ThreadRow>(`${THREAD_SELECT} WHERE t.id = $1 ${THREAD_GROUP}`, [threadId]);
  const row = result.rows[0];
  return row ? toThreadDTO(row) : null;
}

// A thread and its first comment are created together or not at all: a thread
// with no comment would be an empty box in everyone's margin.
export async function createThreadWithComment(params: {
  documentId: string;
  authorId: string;
  quote: string;
  anchor: CommentAnchor | null;
  body: string;
  mentions: string[];
}): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const thread = await client.query<{ id: string }>(
      `INSERT INTO comment_threads (document_id, author_id, quote, anchor)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [params.documentId, params.authorId, params.quote, params.anchor ? JSON.stringify(params.anchor) : null],
    );
    const threadId = thread.rows[0]!.id;
    await client.query("INSERT INTO comments (thread_id, author_id, body, mentions) VALUES ($1, $2, $3, $4)", [
      threadId,
      params.authorId,
      params.body,
      params.mentions,
    ]);
    await client.query("COMMIT");
    return threadId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function addComment(params: { threadId: string; authorId: string; body: string; mentions: string[] }): Promise<string> {
  const result = await pool.query<{ id: string }>(
    "INSERT INTO comments (thread_id, author_id, body, mentions) VALUES ($1, $2, $3, $4) RETURNING id",
    [params.threadId, params.authorId, params.body, params.mentions],
  );
  return result.rows[0]!.id;
}

export async function setThreadResolved(threadId: string, resolvedBy: string | null): Promise<void> {
  await pool.query(
    resolvedBy
      ? "UPDATE comment_threads SET resolved_at = now(), resolved_by = $2 WHERE id = $1"
      : "UPDATE comment_threads SET resolved_at = NULL, resolved_by = NULL WHERE id = $1",
    resolvedBy ? [threadId, resolvedBy] : [threadId],
  );
}

export type CommentInfo = { author_id: string; is_first: boolean };

export async function findComment(threadId: string, commentId: string): Promise<CommentInfo | null> {
  const result = await pool.query<CommentInfo>(
    `SELECT c.author_id,
            c.id = (SELECT id FROM comments WHERE thread_id = c.thread_id ORDER BY created_at, id LIMIT 1) AS is_first
     FROM comments c WHERE c.id = $1 AND c.thread_id = $2`,
    [commentId, threadId],
  );
  return result.rows[0] ?? null;
}

export async function updateCommentBody(commentId: string, body: string, mentions: string[]): Promise<void> {
  await pool.query("UPDATE comments SET body = $2, mentions = $3, edited_at = now() WHERE id = $1", [commentId, body, mentions]);
}

export async function deleteComment(commentId: string): Promise<void> {
  await pool.query("DELETE FROM comments WHERE id = $1", [commentId]);
}

export async function deleteThread(threadId: string): Promise<void> {
  await pool.query("DELETE FROM comment_threads WHERE id = $1", [threadId]);
}
