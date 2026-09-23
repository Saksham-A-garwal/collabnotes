import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CommentThreadDTO } from "@collabnotes/shared";
import { createApp } from "../../../app.js";
import { env } from "../../../config/env.js";
import { pool } from "../../../db/pool.js";
import { redisPub } from "../../../lib/redis.js";
import { createFixture, sleep, TestClient, waitFor, type Fixture } from "../../../realtime/__tests__/harness.js";

const app = createApp();
const tokenFor = (userId: string) => jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: "5m" });

const ANCHOR = { from: { type: { client: 1, clock: 4 }, tname: null, item: { client: 1, clock: 9 }, assoc: 0 }, to: { type: null, tname: "default", item: null, assoc: -1 } };

describe("comments", () => {
  let fx: Fixture;
  let commenterId: string;
  let strangerId: string;
  let otherDocId: string;
  const api = (userId: string) => ({
    get: (path: string) => request(app).get(`/api/v1/documents/${fx.documentId}/comments${path}`).set("Authorization", `Bearer ${tokenFor(userId)}`),
    post: (path: string, body: object) =>
      request(app).post(`/api/v1/documents/${fx.documentId}/comments${path}`).set("Authorization", `Bearer ${tokenFor(userId)}`).send(body),
    patch: (path: string, body: object) =>
      request(app).patch(`/api/v1/documents/${fx.documentId}/comments${path}`).set("Authorization", `Bearer ${tokenFor(userId)}`).send(body),
    del: (path: string) => request(app).delete(`/api/v1/documents/${fx.documentId}/comments${path}`).set("Authorization", `Bearer ${tokenFor(userId)}`),
  });

  async function startThread(userId: string, body = "First!", quote = "some text"): Promise<CommentThreadDTO> {
    const res = await api(userId).post("", { quote, anchor: ANCHOR, body });
    expect(res.status).toBe(201);
    return res.body.thread;
  }

  beforeAll(async () => {
    fx = await createFixture("cmt");
    const mk = async (name: string) =>
      (await pool.query<{ id: string }>("INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id", [`cmt-${name}@test.local`, `cmt ${name}`])).rows[0]!.id;
    commenterId = await mk("commenter");
    strangerId = await mk("stranger");
    await pool.query("INSERT INTO document_access (document_id, user_id, role) VALUES ($1, $2, 'commenter')", [fx.documentId, commenterId]);
    otherDocId = (await pool.query<{ id: string }>("INSERT INTO documents (owner_id) VALUES ($1) RETURNING id", [strangerId])).rows[0]!.id;
  });
  afterAll(async () => {
    await fx.cleanup();
    await pool.query("DELETE FROM documents WHERE id = $1", [otherDocId]);
    await pool.query("DELETE FROM users WHERE id = ANY($1)", [[commenterId, strangerId]]);
    const keys = await redisPub.keys("ratelimit:comment-write:*");
    if (keys.length) await redisPub.del(...keys);
  });

  describe("who can do what", () => {
    it("owners, editors and commenters can start a thread; viewers can read but not write", async () => {
      for (const userId of [fx.ownerId, fx.editorId, commenterId]) {
        const thread = await startThread(userId, "hello");
        expect(thread.comments).toHaveLength(1);
        expect(thread.author.id).toBe(userId);
      }
      const denied = await api(fx.viewerId).post("", { quote: "x", anchor: ANCHOR, body: "hi" });
      expect(denied.status).toBe(403);

      const list = await api(fx.viewerId).get("");
      expect(list.status).toBe(200);
      expect(list.body.threads.length).toBeGreaterThanOrEqual(3);
    });

    it("someone with no access gets 404 for everything, not a hint that the document exists", async () => {
      const thread = await startThread(fx.ownerId);
      expect((await api(strangerId).get("")).status).toBe(404);
      expect((await api(strangerId).post("", { quote: "x", body: "hi" })).status).toBe(404);
      expect((await api(strangerId).post(`/${thread.id}/replies`, { body: "hi" })).status).toBe(404);
      expect((await api(strangerId).patch(`/${thread.id}`, { resolved: true })).status).toBe(404);
      expect((await api(strangerId).del(`/${thread.id}`)).status).toBe(404);
    });

    it("a viewer can't reply, resolve, edit or delete", async () => {
      const thread = await startThread(fx.ownerId);
      expect((await api(fx.viewerId).post(`/${thread.id}/replies`, { body: "hi" })).status).toBe(403);
      expect((await api(fx.viewerId).patch(`/${thread.id}`, { resolved: true })).status).toBe(403);
      expect((await api(fx.viewerId).patch(`/${thread.id}/comments/${thread.comments[0]!.id}`, { body: "hi" })).status).toBe(403);
      expect((await api(fx.viewerId).del(`/${thread.id}`)).status).toBe(403);
    });

    it("a thread id from another document can't be reached through this one", async () => {
      const foreign = await request(app)
        .post(`/api/v1/documents/${otherDocId}/comments`)
        .set("Authorization", `Bearer ${tokenFor(strangerId)}`)
        .send({ quote: "secret", anchor: ANCHOR, body: "private" });
      expect(foreign.status).toBe(201);
      const foreignId = foreign.body.thread.id as string;

      expect((await api(fx.ownerId).post(`/${foreignId}/replies`, { body: "sneaky" })).status).toBe(404);
      expect((await api(fx.ownerId).patch(`/${foreignId}`, { resolved: true })).status).toBe(404);
      expect((await api(fx.ownerId).del(`/${foreignId}`)).status).toBe(404);
      expect((await api(fx.ownerId).get("")).body.threads.some((t: CommentThreadDTO) => t.id === foreignId)).toBe(false);
    });
  });

  describe("threads and replies", () => {
    it("replies are appended in order and every author is named", async () => {
      const thread = await startThread(fx.ownerId, "question");
      await api(fx.editorId).post(`/${thread.id}/replies`, { body: "answer" });
      const res = await api(commenterId).post(`/${thread.id}/replies`, { body: "follow-up" });
      expect(res.status).toBe(201);
      const t: CommentThreadDTO = res.body.thread;
      expect(t.comments.map((c) => c.body)).toEqual(["question", "answer", "follow-up"]);
      expect(t.comments.map((c) => c.author.displayName)).toEqual(["cmt owner", "cmt editor", "cmt commenter"]);
    });

    it("resolve and reopen record who did it", async () => {
      const thread = await startThread(fx.ownerId);
      const resolved = (await api(commenterId).patch(`/${thread.id}`, { resolved: true })).body.thread as CommentThreadDTO;
      expect(resolved.resolvedAt).not.toBeNull();
      expect(resolved.resolvedBy?.id).toBe(commenterId);
      const reopened = (await api(fx.ownerId).patch(`/${thread.id}`, { resolved: false })).body.thread as CommentThreadDTO;
      expect(reopened.resolvedAt).toBeNull();
      expect(reopened.resolvedBy).toBeNull();
    });

    it("only the author can edit a comment, and it's marked as edited", async () => {
      const thread = await startThread(commenterId, "typo");
      const commentId = thread.comments[0]!.id;
      expect((await api(fx.ownerId).patch(`/${thread.id}/comments/${commentId}`, { body: "hijack" })).status).toBe(403);
      const res = await api(commenterId).patch(`/${thread.id}/comments/${commentId}`, { body: "fixed" });
      expect(res.status).toBe(200);
      expect(res.body.thread.comments[0].body).toBe("fixed");
      expect(res.body.thread.comments[0].editedAt).not.toBeNull();
    });

    it("authors delete their own; the owner can delete anyone's; nobody else can", async () => {
      const thread = await startThread(fx.ownerId, "topic");
      const reply = (await api(commenterId).post(`/${thread.id}/replies`, { body: "mine" })).body.thread.comments[1];
      const other = (await api(commenterId).post(`/${thread.id}/replies`, { body: "also mine" })).body.thread.comments[2];

      expect((await api(fx.editorId).del(`/${thread.id}/comments/${reply.id}`)).status).toBe(403);
      expect((await api(commenterId).del(`/${thread.id}/comments/${reply.id}`)).status).toBe(200);
      const afterOwner = await api(fx.ownerId).del(`/${thread.id}/comments/${other.id}`);
      expect(afterOwner.status).toBe(200);
      expect(afterOwner.body.thread.comments).toHaveLength(1);
    });

    it("the opening comment can't be deleted on its own — delete the thread instead", async () => {
      const thread = await startThread(fx.ownerId);
      const res = await api(fx.ownerId).del(`/${thread.id}/comments/${thread.comments[0]!.id}`);
      expect(res.status).toBe(400);
    });

    it("deleting a thread removes its comments; only its author or the owner may", async () => {
      const thread = await startThread(commenterId);
      await api(fx.ownerId).post(`/${thread.id}/replies`, { body: "reply" });
      expect((await api(fx.editorId).del(`/${thread.id}`)).status).toBe(403);
      expect((await api(commenterId).del(`/${thread.id}`)).status).toBe(204);
      const left = await pool.query("SELECT 1 FROM comments WHERE thread_id = $1", [thread.id]);
      expect(left.rowCount).toBe(0);

      const ownersOwn = await startThread(fx.editorId);
      expect((await api(fx.ownerId).del(`/${ownersOwn.id}`)).status).toBe(204);
    });

    it("deleting the document deletes its comments", async () => {
      const doc = (await pool.query<{ id: string }>("INSERT INTO documents (owner_id) VALUES ($1) RETURNING id", [fx.ownerId])).rows[0]!.id;
      const res = await request(app)
        .post(`/api/v1/documents/${doc}/comments`)
        .set("Authorization", `Bearer ${tokenFor(fx.ownerId)}`)
        .send({ quote: "gone soon", anchor: ANCHOR, body: "bye" });
      expect(res.status).toBe(201);
      await pool.query("DELETE FROM documents WHERE id = $1", [doc]);
      expect((await pool.query("SELECT 1 FROM comment_threads WHERE document_id = $1", [doc])).rowCount).toBe(0);
    });
  });

  describe("validation", () => {
    it("rejects empty and oversized bodies, a missing quote, and a bad anchor", async () => {
      const c = api(fx.ownerId);
      expect((await c.post("", { quote: "x", body: "   " })).status).toBe(400);
      expect((await c.post("", { quote: "x", body: "a".repeat(2001) })).status).toBe(400);
      expect((await c.post("", { quote: "", body: "hi" })).status).toBe(400);
      expect((await c.post("", { quote: "q".repeat(501), body: "hi" })).status).toBe(400);
      expect((await c.post("", { quote: "x", body: "hi", anchor: "not-an-object" })).status).toBe(400);
      expect((await c.post("", { quote: "x", body: "hi", anchor: { from: {}, to: [] } })).status).toBe(400);
      expect((await c.post("", { quote: "x", body: "hi", anchor: { from: { pad: "z".repeat(5000) }, to: {} } })).status).toBe(400);
      expect((await c.patch("/not-a-uuid", { resolved: true })).status).toBe(400);
    });

    it("a thread without an anchor is allowed (it just isn't pinned to text)", async () => {
      const res = await api(fx.ownerId).post("", { quote: "loose", body: "unpinned" });
      expect(res.status).toBe(201);
      expect(res.body.thread.anchor).toBeNull();
    });

    it("stores bodies verbatim: markup is data, not something the server interprets", async () => {
      const body = `<img src=x onerror=alert(1)> & "quotes"`;
      const thread = await startThread(fx.ownerId, body);
      expect(thread.comments[0]!.body).toBe(body);
    });
  });

  describe("ceilings", () => {
    it("stops new threads once a document has 500, and new replies once a thread has 200", async () => {
      const doc = (await pool.query<{ id: string }>("INSERT INTO documents (owner_id) VALUES ($1) RETURNING id", [fx.ownerId])).rows[0]!.id;
      try {
        await pool.query(
          "INSERT INTO comment_threads (document_id, author_id, quote) SELECT $1, $2, 'q' FROM generate_series(1, 500)",
          [doc, fx.ownerId],
        );
        const res = await request(app)
          .post(`/api/v1/documents/${doc}/comments`)
          .set("Authorization", `Bearer ${tokenFor(fx.ownerId)}`)
          .send({ quote: "one too many", body: "hi" });
        expect(res.status).toBe(429);
        expect(res.body.error.message).toMatch(/500 comment threads/);

        const thread = (await pool.query<{ id: string }>("SELECT id FROM comment_threads WHERE document_id = $1 LIMIT 1", [doc])).rows[0]!.id;
        await pool.query("INSERT INTO comments (thread_id, author_id, body) SELECT $1, $2, 'r' FROM generate_series(1, 200)", [thread, fx.ownerId]);
        const reply = await request(app)
          .post(`/api/v1/documents/${doc}/comments/${thread}/replies`)
          .set("Authorization", `Bearer ${tokenFor(fx.ownerId)}`)
          .send({ body: "one too many" });
        expect(reply.status).toBe(429);
      } finally {
        await pool.query("DELETE FROM documents WHERE id = $1", [doc]);
      }
    });
  });

  describe("role changes in the live editor", () => {
    it("a commenter can't change the document over the socket (same as a viewer)", async () => {
      const owner = new TestClient(fx, fx.ownerId);
      const commenter = new TestClient(fx, commenterId);
      await Promise.all([owner.connect(), commenter.connect()]);
      expect(commenter.role).toBe("commenter");

      const before = owner.text();
      commenter.insert("sneaky edit");
      await waitFor(() => commenter.events.some((e) => e.name === "document:error"));
      await sleep(200);
      expect(owner.text()).toBe(before);
    });

    it("comment changes reach everyone in the document, live", async () => {
      const owner = new TestClient(fx, fx.ownerId);
      const viewer = new TestClient(fx, fx.viewerId);
      await Promise.all([owner.connect(), viewer.connect()]);

      const thread = await startThread(commenterId, "live one");
      await waitFor(() => viewer.events.some((e) => e.name === "comment:thread-upserted"));
      const pushed = viewer.events.find((e) => e.name === "comment:thread-upserted")!.payload as { documentId: string; thread: CommentThreadDTO };
      expect(pushed.documentId).toBe(fx.documentId);
      expect(pushed.thread.id).toBe(thread.id);

      await api(fx.ownerId).del(`/${thread.id}`);
      await waitFor(() => owner.events.some((e) => e.name === "comment:thread-deleted"));
      const gone = owner.events.find((e) => e.name === "comment:thread-deleted")!.payload as { threadId: string };
      expect(gone.threadId).toBe(thread.id);
    });

    it("people outside the document's room don't receive its comments", async () => {
      const outsider = new TestClient(fx, strangerId);
      outsider.socket.on("connect", () => undefined);
      outsider.socket.connect();
      await waitFor(() => outsider.events.some((e) => e.name === "document:error"));

      await startThread(fx.ownerId, "private chatter");
      await sleep(300);
      expect(outsider.events.some((e) => e.name === "comment:thread-upserted")).toBe(false);
    });
  });
});
