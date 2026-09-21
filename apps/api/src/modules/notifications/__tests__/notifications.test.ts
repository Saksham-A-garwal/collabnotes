import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NotificationsResponse } from "@collabnotes/shared";
import { createApp } from "../../../app.js";
import { env } from "../../../config/env.js";
import { pool } from "../../../db/pool.js";
import { redisPub } from "../../../lib/redis.js";
import { createFixture, sleep, TestClient, waitFor, type Fixture } from "../../../realtime/__tests__/harness.js";

const app = createApp();
const tokenFor = (userId: string) => jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: "5m" });

describe("notifications", () => {
  let fx: Fixture;
  const as = (userId: string) => ({ Authorization: `Bearer ${tokenFor(userId)}` });
  const list = async (userId: string): Promise<NotificationsResponse> =>
    (await request(app).get("/api/v1/notifications").set(as(userId))).body;
  const mention = async (authorId: string, body: string, ...mentions: string[]) => {
    const res = await request(app)
      .post(`/api/v1/documents/${fx.documentId}/comments`)
      .set(as(authorId))
      .send({ quote: "the launch plan", body, mentions });
    expect(res.status).toBe(201);
    await sleep(250); // mentions are recorded in the background
    return res.body.thread.id as string;
  };

  beforeAll(async () => {
    fx = await createFixture("ntf");
    await pool.query("UPDATE documents SET title = 'Launch notes' WHERE id = $1", [fx.documentId]);
    await pool.query("UPDATE users SET display_name = 'Ada Lovelace' WHERE id = $1", [fx.ownerId]);
    // Keep these tests off the mail budget: only the bell is under test.
    await pool.query("UPDATE users SET email_mentions = false WHERE id = ANY($1)", [[fx.editorId, fx.viewerId, fx.ownerId]]);
  });
  afterAll(async () => {
    await fx.cleanup();
    for (const pattern of ["ratelimit:comment-write:*", "ratelimit:notifications-read:*"]) {
      const keys = await redisPub.keys(pattern);
      if (keys.length) await redisPub.del(...keys);
    }
  });

  it("needs a signed-in user", async () => {
    expect((await request(app).get("/api/v1/notifications")).status).toBe(401);
    expect((await request(app).get("/api/v1/notifications/unread-count")).status).toBe(401);
    expect((await request(app).post("/api/v1/notifications/read-all")).status).toBe(401);
  });

  it("lists your mentions, newest first, with who, where and what was said", async () => {
    const first = await mention(fx.ownerId, "Can you check the dates?", fx.editorId);
    const second = await mention(fx.ownerId, "And the <b>budget</b> too\n  please", fx.editorId);

    const { notifications, unreadCount } = await list(fx.editorId);
    expect(unreadCount).toBe(2);
    expect(notifications.map((n) => n.threadId)).toEqual([second, first]);
    expect(notifications[0]).toMatchObject({
      kind: "mention",
      documentId: fx.documentId,
      documentTitle: "Launch notes",
      actor: { id: fx.ownerId, displayName: "Ada Lovelace" },
      quote: "the launch plan",
      excerpt: "And the <b>budget</b> too please", // whitespace flattened; the text is data, not markup
      readAt: null,
    });
  });

  it("only ever shows a person their own", async () => {
    await mention(fx.ownerId, "for the editor only", fx.editorId);
    const viewer = await list(fx.viewerId);
    expect(viewer.notifications).toEqual([]);
    expect(viewer.unreadCount).toBe(0);
  });

  it("marks one as read, and can't mark someone else's", async () => {
    const before = await list(fx.editorId);
    const target = before.notifications[0]!;

    // Another person "reading" it changes nothing.
    expect((await request(app).post(`/api/v1/notifications/${target.id}/read`).set(as(fx.viewerId))).status).toBe(204);
    expect((await list(fx.editorId)).unreadCount).toBe(before.unreadCount);

    expect((await request(app).post(`/api/v1/notifications/${target.id}/read`).set(as(fx.editorId))).status).toBe(204);
    const after = await list(fx.editorId);
    expect(after.unreadCount).toBe(before.unreadCount - 1);
    expect(after.notifications.find((n) => n.id === target.id)!.readAt).not.toBeNull();
    // Doing it twice is harmless.
    expect((await request(app).post(`/api/v1/notifications/${target.id}/read`).set(as(fx.editorId))).status).toBe(204);
    expect((await list(fx.editorId)).unreadCount).toBe(after.unreadCount);
  });

  it("marks everything as read", async () => {
    expect((await request(app).post("/api/v1/notifications/read-all").set(as(fx.editorId))).status).toBe(204);
    const { notifications, unreadCount } = await list(fx.editorId);
    expect(unreadCount).toBe(0);
    expect(notifications.every((n) => n.readAt !== null)).toBe(true);
    expect((await request(app).get("/api/v1/notifications/unread-count").set(as(fx.editorId))).body).toEqual({ unreadCount: 0 });
  });

  it("rejects a malformed id", async () => {
    expect((await request(app).post("/api/v1/notifications/not-a-uuid/read").set(as(fx.editorId))).status).toBe(400);
  });

  it("stops showing notifications about a document once you can no longer open it", async () => {
    await mention(fx.ownerId, "you'll lose access to this", fx.viewerId);
    expect((await list(fx.viewerId)).unreadCount).toBe(1);

    await pool.query("DELETE FROM document_access WHERE document_id = $1 AND user_id = $2", [fx.documentId, fx.viewerId]);
    const gone = await list(fx.viewerId);
    expect(gone.notifications).toEqual([]);
    expect(gone.unreadCount).toBe(0);

    // Given access back, they reappear: nothing was deleted, only hidden.
    await pool.query("INSERT INTO document_access (document_id, user_id, role) VALUES ($1, $2, 'viewer')", [fx.documentId, fx.viewerId]);
    expect((await list(fx.viewerId)).unreadCount).toBe(1);
  });

  it("deleting the comment thread removes its notifications", async () => {
    const thread = await mention(fx.ownerId, "short-lived", fx.editorId);
    expect((await list(fx.editorId)).notifications.some((n) => n.threadId === thread)).toBe(true);
    await request(app).delete(`/api/v1/documents/${fx.documentId}/comments/${thread}`).set(as(fx.ownerId));
    expect((await list(fx.editorId)).notifications.some((n) => n.threadId === thread)).toBe(false);
  });

  it("pushes 'notification:new' to the person's open connection right away", async () => {
    const editor = new TestClient(fx, fx.editorId);
    const owner = new TestClient(fx, fx.ownerId);
    await Promise.all([editor.connect(), owner.connect()]);

    await mention(fx.ownerId, "live ping", fx.editorId);
    await waitFor(() => editor.events.some((e) => e.name === "notification:new"));
    // Only the person mentioned hears it.
    expect(owner.events.some((e) => e.name === "notification:new")).toBe(false);
  });
});
