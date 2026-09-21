import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { io as ioClient, type Socket } from "socket.io-client";
import * as Y from "yjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../config/env.js";
import { pool } from "../../db/pool.js";
import { attachRealtime } from "../index.js";

// Development Plan §1.2's "realtime correctness test harness": two
// in-memory Yjs clients talking to a real server instance, verifying
// FR-12/FR-13 (optimistic local apply, opaque relay) and FR-17 (server-side
// viewer write rejection) — not just that the code typechecks.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("realtime sync core", () => {
  let server: HttpServer;
  let baseUrl: string;
  let documentId: string;
  let ownerId: string;
  let editorId: string;
  let viewerId: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const owner = await pool.query<{ id: string }>(
      "INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id",
      ["sync-owner@test.local", "Sync Owner"],
    );
    ownerId = owner.rows[0]!.id;

    const editor = await pool.query<{ id: string }>(
      "INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id",
      ["sync-editor@test.local", "Sync Editor"],
    );
    editorId = editor.rows[0]!.id;

    const viewer = await pool.query<{ id: string }>(
      "INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id",
      ["sync-viewer@test.local", "Sync Viewer"],
    );
    viewerId = viewer.rows[0]!.id;

    const doc = await pool.query<{ id: string }>(
      "INSERT INTO documents (owner_id) VALUES ($1) RETURNING id",
      [ownerId],
    );
    documentId = doc.rows[0]!.id;

    await pool.query("INSERT INTO document_access (document_id, user_id, role) VALUES ($1, $2, 'editor')", [
      documentId,
      editorId,
    ]);
    await pool.query("INSERT INTO document_access (document_id, user_id, role) VALUES ($1, $2, 'viewer')", [
      documentId,
      viewerId,
    ]);

    server = createServer();
    attachRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.query("DELETE FROM documents WHERE id = $1", [documentId]);
    await pool.query("DELETE FROM users WHERE id = ANY($1)", [[ownerId, editorId, viewerId]]);
  });

  function tokenFor(userId: string): string {
    return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: "5m" });
  }

  function connectAndJoin(userId: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = ioClient(baseUrl, { auth: { token: tokenFor(userId) } });
      sockets.push(socket);
      socket.on("connect_error", reject);
      socket.on("connect", () => {
        socket.emit("document:join", { documentId });
      });
      socket.once("document:joined", () => resolve(socket));
      socket.once("document:error", (payload) => reject(new Error(payload.message)));
    });
  }

  it("merges concurrent edits from two clients with no data loss", async () => {
    const socketA = await connectAndJoin(ownerId);
    const socketB = await connectAndJoin(editorId);

    const docA = new Y.Doc();
    const docB = new Y.Doc();

    function wire(socket: Socket, doc: Y.Doc) {
      socket.on("sync:step2", ({ update }: { update: ArrayBuffer }) =>
        Y.applyUpdate(doc, new Uint8Array(update), "remote"),
      );
      socket.on("sync:update", ({ update }: { update: ArrayBuffer }) =>
        Y.applyUpdate(doc, new Uint8Array(update), "remote"),
      );
      doc.on("update", (update: Uint8Array, origin: unknown) => {
        if (origin === "remote") return;
        socket.emit("sync:update", { documentId, update: toArrayBuffer(update) });
      });
    }
    wire(socketA, docA);
    wire(socketB, docB);

    socketA.emit("sync:step1", { documentId, stateVector: toArrayBuffer(Y.encodeStateVector(docA)) });
    socketB.emit("sync:step1", { documentId, stateVector: toArrayBuffer(Y.encodeStateVector(docB)) });
    await sleep(200);

    // Genuinely concurrent, non-overlapping inserts from two independent clients.
    docA.getText("content").insert(0, "Hello ");
    docB.getText("content").insert(0, "World ");

    await sleep(500);

    const resultA = docA.getText("content").toString();
    const resultB = docB.getText("content").toString();

    expect(resultA).toBe(resultB);
    expect(resultA).toContain("Hello");
    expect(resultA).toContain("World");
    expect(resultA.length).toBe("Hello ".length + "World ".length);
  });

  it("rejects a write from a viewer-role socket (FR-17)", async () => {
    const socketV = await connectAndJoin(viewerId);
    const socketO = await connectAndJoin(ownerId);

    const docV = new Y.Doc();
    const docO = new Y.Doc();

    const rejections: unknown[] = [];
    socketV.on("document:error", (payload) => rejections.push(payload));
    socketO.on("sync:update", ({ update }: { update: ArrayBuffer }) =>
      Y.applyUpdate(docO, new Uint8Array(update), "remote"),
    );

    docV.getText("content").insert(0, "viewer-injected text");
    socketV.emit("sync:update", {
      documentId,
      update: toArrayBuffer(Y.encodeStateAsUpdate(docV)),
    });

    await sleep(300);

    expect(rejections.length).toBeGreaterThan(0);
    expect(docO.getText("content").toString()).not.toContain("viewer-injected");
  });
});
