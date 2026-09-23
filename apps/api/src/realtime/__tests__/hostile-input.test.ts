import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db/pool.js";
import { createFixture, sleep, TestClient, waitFor, type Fixture } from "./harness.js";

describe("hostile socket input", () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await createFixture("hostile");
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  async function withBystanders(attack: (attacker: TestClient) => Promise<void>) {
    const attacker = new TestClient(fx, fx.editorId);
    const owner = new TestClient(fx, fx.ownerId);
    const viewer = new TestClient(fx, fx.viewerId);
    await Promise.all([attacker.connect(), owner.connect(), viewer.connect()]);

    const before = owner.text();
    await attack(attacker);
    await sleep(300);

    expect(owner.text()).toBe(before);
    owner.insert("still-alive;");
    await waitFor(() => viewer.text() === before + "still-alive;");
    return { attacker, owner, viewer };
  }

  it("garbage bytes as a Yjs update are refused without crashing or touching the document", async () => {
    const { attacker } = await withBystanders(async (a) => {
      a.socket.emit("sync:update", { documentId: fx.documentId, update: new Uint8Array([255, 255, 255, 1, 2, 3, 250]).buffer });
    });
    expect(attacker.events.some((e) => e.name === "document:error")).toBe(true);
  });

  it("a number where bytes belong is refused (no giant allocation)", async () => {
    await withBystanders(async (a) => {
      a.socket.emit("sync:update", { documentId: fx.documentId, update: 2_000_000_000 });
      a.socket.emit("awareness:update", { documentId: fx.documentId, update: 2_000_000_000 });
      a.socket.emit("sync:step1", { documentId: fx.documentId, stateVector: 2_000_000_000 });
    });
  });

  it("wrongly typed and missing payloads don't throw", async () => {
    await withBystanders(async (a) => {
      for (const event of ["document:join", "document:leave", "sync:step1", "sync:update", "awareness:update"]) {
        for (const payload of [null, undefined, 42, "text", [], {}, { documentId: 7 }, { documentId: { $ne: null } }]) {
          a.socket.emit(event, payload);
        }
      }
    });
  });

  it("a non-UUID document id is a validation error, not a database error", async () => {
    const a = new TestClient(fx, fx.editorId);
    await a.connect();
    a.socket.emit("document:join", { documentId: "1'; DROP TABLE documents;--" });
    await waitFor(() => a.events.some((e) => e.name === "document:error"));
    const err = a.events.find((e) => e.name === "document:error")!.payload as { code: string };
    expect(err.code).toBe("VALIDATION_ERROR");
  });

  it("a flood is cut off by disconnecting the sender, and bystanders never notice", async () => {
    const { attacker } = await withBystanders(async (a) => {
      for (let i = 0; i < 3000; i++) {
        a.socket.emit("awareness:update", { documentId: fx.documentId, update: new Uint8Array([0]).buffer });
      }
      await waitFor(() => !a.socket.connected, 5000);
    });
    expect(attacker.socket.connected).toBe(false);
  });

  it("a fast typist's burst of cursor updates is NOT treated as a flood (presence is dropped, never punished)", async () => {
    const typist = new TestClient(fx, fx.editorId);
    const owner = new TestClient(fx, fx.ownerId);
    await Promise.all([typist.connect(), owner.connect()]);

    for (let i = 0; i < 400; i++) {
      typist.socket.emit("awareness:update", { documentId: fx.documentId, update: new Uint8Array([0]).buffer });
      if (i % 20 === 0) typist.insert("x");
    }
    await sleep(500);

    expect(typist.socket.connected).toBe(true);
    await waitFor(() => owner.text() === typist.text() && owner.text().length >= 20);
  });

  it("an oversized frame is dropped at the transport, not buffered", async () => {
    const { attacker } = await withBystanders(async (a) => {
      a.socket.emit("sync:update", { documentId: fx.documentId, update: new Uint8Array(2_000_000).buffer });
      await waitFor(() => !a.socket.connected, 5000);
    });
    expect(attacker.socket.connected).toBe(false);
  });

  it("a join loop is cut off, and steady-state a socket can't hold more than 20 documents open", async () => {
    const burst = new TestClient(fx, fx.editorId);
    await burst.connect();
    for (let i = 0; i < 60; i++) burst.socket.emit("document:join", { documentId: crypto.randomUUID() });
    await waitFor(() => !burst.socket.connected, 5000);

    const ids: string[] = [];
    for (let i = 0; i < 21; i++) {
      const d = await pool.query<{ id: string }>("INSERT INTO documents (owner_id) VALUES ($1) RETURNING id", [fx.ownerId]);
      ids.push(d.rows[0]!.id);
      await pool.query("INSERT INTO document_access (document_id, user_id, role) VALUES ($1, $2, 'editor')", [d.rows[0]!.id, fx.editorId]);
    }
    try {
      const a = new TestClient(fx, fx.editorId);
      await a.connect();
      let refused = 0;
      a.socket.on("document:error", (e: { code: string }) => {
        if (e.code === "FORBIDDEN") refused++;
      });
      let joinedCount = 1;
      a.socket.on("document:joined", () => joinedCount++);
      for (const id of ids) {
        a.socket.emit("document:join", { documentId: id });
        await sleep(40);
      }
      await waitFor(() => refused >= 1, 5000);
      expect(joinedCount).toBe(20);
      expect(a.socket.connected).toBe(true);
    } finally {
      await pool.query("DELETE FROM documents WHERE id = ANY($1)", [ids]);
    }
  });
});
