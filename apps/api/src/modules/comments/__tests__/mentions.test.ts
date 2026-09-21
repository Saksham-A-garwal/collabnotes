import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CommentThreadDTO } from "@collabnotes/shared";
import { createApp } from "../../../app.js";
import { env } from "../../../config/env.js";
import { pool } from "../../../db/pool.js";
import { redisPub } from "../../../lib/redis.js";
import { createFixture, sleep, TestClient, waitFor, type Fixture } from "../../../realtime/__tests__/harness.js";
import * as mailer from "../../auth/email/mailer.js";
import { latestOutboxEmail } from "../../auth/email/mailer.js";

const app = createApp();
const tokenFor = (userId: string) => jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: "5m" });
const dailyKey = () => `email:daily:${new Date().toISOString().slice(0, 10)}`;

// Fixture users: owner, editor, viewer (harness), plus a commenter and an outsider added here.
describe("mentions", () => {
  let fx: Fixture;
  let commenterId: string;
  let outsiderId: string;
  const email = (role: string) => `mnt-${role}@test.local`;

  const post = (userId: string, path: string, body: object) =>
    request(app).post(`/api/v1/documents/${fx.documentId}/comments${path}`).set("Authorization", `Bearer ${tokenFor(userId)}`).send(body);
  const patch = (userId: string, path: string, body: object) =>
    request(app).patch(`/api/v1/documents/${fx.documentId}/comments${path}`).set("Authorization", `Bearer ${tokenFor(userId)}`).send(body);
  const notificationsFor = async (userId: string) =>
    (await pool.query("SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at", [userId])).rows;

  async function startThread(authorId: string, body: string, mentions: string[]): Promise<CommentThreadDTO> {
    const res = await post(authorId, "", { quote: "the plan", body, mentions });
    expect(res.status).toBe(201);
    return res.body.thread;
  }

  beforeAll(async () => {
    fx = await createFixture("mnt");
    const mk = async (name: string) =>
      (await pool.query<{ id: string }>("INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id", [email(name), `mnt ${name}`])).rows[0]!.id;
    commenterId = await mk("commenter");
    outsiderId = await mk("outsider");
    await pool.query("INSERT INTO document_access (document_id, user_id, role) VALUES ($1, $2, 'commenter')", [fx.documentId, commenterId]);
    await pool.query("UPDATE documents SET title = 'Q3 <planning>' WHERE id = $1", [fx.documentId]);
    await redisPub.del(dailyKey());
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await fx.cleanup();
    await pool.query("DELETE FROM users WHERE id = ANY($1)", [[commenterId, outsiderId]]);
    for (const pattern of ["mention-email:*", "ratelimit:comment-write:*"]) {
      const keys = await redisPub.keys(pattern);
      if (keys.length) await redisPub.del(...keys);
    }
  });

  describe("who can be mentioned", () => {
    it("lists the owner and everyone the document is shared with, by name only", async () => {
      for (const asUser of [fx.ownerId, fx.viewerId, commenterId]) {
        const res = await request(app)
          .get(`/api/v1/documents/${fx.documentId}/comments/people`)
          .set("Authorization", `Bearer ${tokenFor(asUser)}`);
        expect(res.status).toBe(200);
        const ids = res.body.people.map((p: { id: string }) => p.id).sort();
        expect(ids).toEqual([fx.ownerId, fx.editorId, fx.viewerId, commenterId].sort());
        // No email addresses: a commenter shouldn't learn everyone's address.
        expect(JSON.stringify(res.body)).not.toContain("@test.local");
        expect(res.body.people.every((p: object) => Object.keys(p).sort().join() === "displayName,id")).toBe(true);
      }
    });

    it("answers 404 to someone with no access", async () => {
      const res = await request(app).get(`/api/v1/documents/${fx.documentId}/comments/people`).set("Authorization", `Bearer ${tokenFor(outsiderId)}`);
      expect(res.status).toBe(404);
    });

    it("silently drops mentions of people who can't open the document, yourself, and duplicates", async () => {
      const thread = await startThread(fx.ownerId, "hello", [outsiderId, fx.ownerId, fx.editorId, fx.editorId, "00000000-0000-4000-8000-000000000000"]);
      expect(thread.comments[0]!.mentions).toEqual([fx.editorId]);
      await sleep(300);
      expect(await notificationsFor(outsiderId)).toHaveLength(0);
      expect(await notificationsFor(fx.ownerId)).toHaveLength(0);
      expect(latestOutboxEmail(email("outsider"))).toBeNull();
    });

    it("rejects a malformed or oversized mention list", async () => {
      expect((await post(fx.ownerId, "", { quote: "q", body: "hi", mentions: ["not-a-uuid"] })).status).toBe(400);
      const many = Array.from({ length: 11 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
      expect((await post(fx.ownerId, "", { quote: "q", body: "hi", mentions: many })).status).toBe(400);
    });
  });

  describe("notifying", () => {
    it("records a notification and emails the person, with a link to the thread", async () => {
      const thread = await startThread(fx.ownerId, "Could you review this <b>bit</b>?\nThanks", [commenterId]);
      expect(thread.comments[0]!.mentions).toEqual([commenterId]);

      const rows = await notificationsFor(commenterId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ kind: "mention", document_id: fx.documentId, thread_id: thread.id, actor_id: fx.ownerId, read_at: null });

      await waitFor(() => latestOutboxEmail(email("commenter")) !== null);
      const mail = latestOutboxEmail(email("commenter"))!;
      expect(mail.subject).toBe("mnt owner mentioned you in “Q3 <planning>”");
      expect(mail.text).toContain(`/documents/${fx.documentId}?thread=${thread.id}`);
      expect(mail.text).toContain("Could you review this <b>bit</b>?");
      // Everything a person typed is escaped in the HTML part.
      expect(mail.html).toContain("Could you review this &lt;b&gt;bit&lt;/b&gt;?<br>Thanks");
      expect(mail.html).not.toContain("<b>bit</b>");
      expect(mail.html).toContain("Q3 &lt;planning&gt;");
    });

    it("respects the person's own switch: no email, but the notification is still recorded", async () => {
      await pool.query("UPDATE users SET email_mentions = false WHERE id = $1", [fx.viewerId]);
      const send = vi.spyOn(mailer, "sendEmail");
      const thread = await startThread(fx.ownerId, "for the viewer", [fx.viewerId]);
      await sleep(400);
      expect(send).not.toHaveBeenCalled();
      const rows = await notificationsFor(fx.viewerId);
      expect(rows.some((r) => r.thread_id === thread.id)).toBe(true);
      await pool.query("UPDATE users SET email_mentions = true WHERE id = $1", [fx.viewerId]);
    });

    it("doesn't email someone who is looking at the document right now", async () => {
      const editor = new TestClient(fx, fx.editorId);
      await editor.connect();
      const send = vi.spyOn(mailer, "sendEmail");
      const thread = await startThread(fx.ownerId, "ping the person in the room", [fx.editorId]);
      await sleep(400);
      expect(send).not.toHaveBeenCalled();
      expect((await notificationsFor(fx.editorId)).some((r) => r.thread_id === thread.id)).toBe(true);
      editor.socket.disconnect();
      await waitFor(() => !editor.socket.connected);
    });

    it("sends one email per thread per cooldown, however many replies mention them", async () => {
      const send = vi.spyOn(mailer, "sendEmail");
      const thread = await startThread(fx.ownerId, "first", [fx.editorId]);
      await waitFor(() => send.mock.calls.length === 1); // the first mention is emailed…
      await post(fx.ownerId, `/${thread.id}/replies`, { body: "second", mentions: [fx.editorId] });
      await post(fx.ownerId, `/${thread.id}/replies`, { body: "third", mentions: [fx.editorId] });
      await sleep(400);
      expect(send).toHaveBeenCalledTimes(1); // …the replies within the cooldown are not
      // …but each mention is still a notification.
      expect((await notificationsFor(fx.editorId)).filter((r) => r.thread_id === thread.id)).toHaveLength(3);
    });

    it("stops emailing when the author hits their hourly limit, and never fails the comment", async () => {
      const author = commenterId;
      await redisPub.set(`mention-email:author:${author}`, "20", "EX", 3600);
      const send = vi.spyOn(mailer, "sendEmail");
      const res = await post(author, "", { quote: "x", body: "over the limit", mentions: [fx.ownerId] });
      expect(res.status).toBe(201);
      await sleep(400);
      expect(send).not.toHaveBeenCalled();
    });

    it("a failing email provider never fails the comment", async () => {
      vi.spyOn(mailer, "sendEmail").mockRejectedValue(new Error("provider down"));
      const thread = await startThread(fx.editorId, "provider is down", [fx.ownerId]);
      expect(thread.comments).toHaveLength(1);
      await sleep(300);
      expect((await notificationsFor(fx.ownerId)).some((r) => r.thread_id === thread.id)).toBe(true);
    });

    it("editing only notifies people who weren't already mentioned", async () => {
      const thread = await startThread(fx.ownerId, "draft", [commenterId]);
      const commentId = thread.comments[0]!.id;
      await sleep(300); // the first mention is recorded in the background
      const before = (await notificationsFor(commenterId)).length;
      const beforeViewer = (await notificationsFor(fx.viewerId)).length;

      const res = await patch(fx.ownerId, `/${thread.id}/comments/${commentId}`, { body: "draft, fixed", mentions: [commenterId, fx.viewerId] });
      expect(res.status).toBe(200);
      expect(res.body.thread.comments[0].mentions.sort()).toEqual([commenterId, fx.viewerId].sort());
      await sleep(300);
      expect(await notificationsFor(commenterId)).toHaveLength(before);
      expect(await notificationsFor(fx.viewerId)).toHaveLength(beforeViewer + 1);
    });

    it("deleting the thread removes its notifications", async () => {
      const thread = await startThread(fx.ownerId, "short-lived", [commenterId]);
      await sleep(200);
      await request(app)
        .delete(`/api/v1/documents/${fx.documentId}/comments/${thread.id}`)
        .set("Authorization", `Bearer ${tokenFor(fx.ownerId)}`);
      expect((await notificationsFor(commenterId)).some((r) => r.thread_id === thread.id)).toBe(false);
    });
  });

  describe("the email preference", () => {
    it("can be read and switched through /auth/me", async () => {
      const off = await request(app).patch("/api/v1/auth/me").set("Authorization", `Bearer ${tokenFor(commenterId)}`).send({ emailMentions: false });
      expect(off.status).toBe(200);
      expect(off.body.user.emailMentions).toBe(false);
      const on = await request(app).patch("/api/v1/auth/me").set("Authorization", `Bearer ${tokenFor(commenterId)}`).send({ emailMentions: true });
      expect(on.body.user.emailMentions).toBe(true);
      // Changing only the preference leaves the name alone.
      expect(on.body.user.displayName).toBe("mnt commenter");
    });

    it("rejects an empty update and a non-boolean", async () => {
      const auth = { Authorization: `Bearer ${tokenFor(commenterId)}` };
      expect((await request(app).patch("/api/v1/auth/me").set(auth).send({})).status).toBe(400);
      expect((await request(app).patch("/api/v1/auth/me").set(auth).send({ emailMentions: "no" })).status).toBe(400);
    });
  });
});
