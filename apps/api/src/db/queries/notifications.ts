import type { NotificationDTO } from "@collabnotes/shared";
import { pool } from "../pool.js";

// A notification is only shown while the person can still open the document it's about:
// if they've been removed from it, its title and the words spoken there must not keep
// leaking through their notification list. (Checked in SQL, on every read.)
const CAN_OPEN = `(d.owner_id = $1 OR EXISTS (SELECT 1 FROM document_access a WHERE a.document_id = d.id AND a.user_id = $1))`;

type Row = {
  id: string;
  document_id: string;
  document_title: string;
  thread_id: string;
  actor_id: string | null;
  actor_name: string | null;
  quote: string;
  body: string;
  created_at: Date;
  read_at: Date | null;
};

const EXCERPT_CHARS = 160;

function toDTO(row: Row): NotificationDTO {
  const flat = row.body.replace(/\s+/g, " ").trim();
  return {
    id: row.id,
    kind: "mention",
    documentId: row.document_id,
    documentTitle: row.document_title,
    threadId: row.thread_id,
    actor: row.actor_id ? { id: row.actor_id, displayName: row.actor_name ?? "Someone" } : null,
    quote: row.quote,
    excerpt: flat.length > EXCERPT_CHARS ? flat.slice(0, EXCERPT_CHARS - 1).trimEnd() + String.fromCharCode(0x2026) : flat,
    createdAt: row.created_at.toISOString(),
    readAt: row.read_at ? row.read_at.toISOString() : null,
  };
}

export async function listNotifications(userId: string, limit: number): Promise<NotificationDTO[]> {
  const result = await pool.query<Row>(
    `SELECT n.id, n.document_id, d.title AS document_title, n.thread_id,
            n.actor_id, actor.display_name AS actor_name,
            t.quote, c.body, n.created_at, n.read_at
     FROM notifications n
     JOIN documents d ON d.id = n.document_id
     JOIN comment_threads t ON t.id = n.thread_id
     JOIN comments c ON c.id = n.comment_id
     LEFT JOIN users actor ON actor.id = n.actor_id
     WHERE n.user_id = $1 AND ${CAN_OPEN}
     ORDER BY n.created_at DESC, n.id
     LIMIT $2`,
    [userId, limit],
  );
  return result.rows.map(toDTO);
}

export async function countUnread(userId: string): Promise<number> {
  const result = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n
     FROM notifications n JOIN documents d ON d.id = n.document_id
     WHERE n.user_id = $1 AND n.read_at IS NULL AND ${CAN_OPEN}`,
    [userId],
  );
  return result.rows[0]!.n;
}

// Only ever the caller's own rows: the user id is part of every WHERE.
export async function markRead(userId: string, notificationId: string): Promise<void> {
  await pool.query("UPDATE notifications SET read_at = now() WHERE id = $2 AND user_id = $1 AND read_at IS NULL", [userId, notificationId]);
}

export async function markAllRead(userId: string): Promise<void> {
  await pool.query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [userId]);
}
