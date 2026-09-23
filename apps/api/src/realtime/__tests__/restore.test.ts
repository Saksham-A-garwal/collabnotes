import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { io as ioClient, type Socket } from "socket.io-client";
import * as Y from "yjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../config/env.js";
import { pool } from "../../db/pool.js";
import { listSnapshotsForUser, restoreSnapshotForUser } from "../../modules/snapshots/snapshots.service.js";
import { attachRealtime } from "../index.js";
import { hydrateDocument } from "../persistence.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function appendParagraph(doc: Y.Doc, text: string): void {
  const frag = doc.getXmlFragment("default");
  const p = new Y.XmlElement("paragraph");
  const t = new Y.XmlText();
  t.insert(0, text);
  p.insert(0, [t]);
  frag.insert(frag.length, [p]);
}

function fragmentText(doc: Y.Doc): string {
  return doc.getXmlFragment("default").toString();
}

describe("version history / restore", () => {
  let server: HttpServer;
  let baseUrl: string;
  let documentId: string;
  let ownerId: string;
  let viewerId: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const owner = await pool.query<{ id: string }>(
      "INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id",
      ["restore-owner@test.local", "Restore Owner"],
    );
    ownerId = owner.rows[0]!.id;

    const viewer = await pool.query<{ id: string }>(
      "INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id",
      ["restore-viewer@test.local", "Restore Viewer"],
    );
    viewerId = viewer.rows[0]!.id;

    const doc = await pool.query<{ id: string }>(
      "INSERT INTO documents (owner_id) VALUES ($1) RETURNING id",
      [ownerId],
    );
    documentId = doc.rows[0]!.id;

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
    await pool.query("DELETE FROM users WHERE id = ANY($1)", [[ownerId, viewerId]]);
  });

  function tokenFor(userId: string): string {
    return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: "5m" });
  }

  function connectAndJoin(userId: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = ioClient(baseUrl, { auth: { token: tokenFor(userId) } });
      sockets.push(socket);
      socket.on("connect_error", reject);
      socket.on("connect", () => socket.emit("document:join", { documentId }));
      socket.once("document:joined", () => resolve(socket));
      socket.once("document:error", (payload) => reject(new Error(payload.message)));
    });
  }

  it("reverts content live and stays reverted after a fresh hydration", async () => {
    const socket = await connectAndJoin(ownerId);
    const clientDoc = new Y.Doc();

    socket.on("sync:step2", ({ update }: { update: ArrayBuffer }) =>
      Y.applyUpdate(clientDoc, new Uint8Array(update), "remote"),
    );
    socket.on("sync:update", ({ update }: { update: ArrayBuffer }) =>
      Y.applyUpdate(clientDoc, new Uint8Array(update), "remote"),
    );
    clientDoc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === "remote") return;
      socket.emit("sync:update", { documentId, update: toArrayBuffer(update) });
    });

    socket.emit("sync:step1", { documentId, stateVector: toArrayBuffer(Y.encodeStateVector(clientDoc)) });
    await sleep(200);

    appendParagraph(clientDoc, "Hello");
    await sleep(300);
    expect(fragmentText(clientDoc)).toBe("<paragraph>Hello</paragraph>");

    const { getRoomManager } = await import("../index.js");
    await getRoomManager().snapshotIfDirty(documentId);

    const snapshots = await listSnapshotsForUser(documentId, ownerId);
    expect(snapshots.length).toBe(1);
    expect(snapshots[0]!.triggeredBy).toBe("auto");
    const snapshotId = snapshots[0]!.id;

    appendParagraph(clientDoc, "Cruel");
    await sleep(300);
    expect(fragmentText(clientDoc)).toBe("<paragraph>Hello</paragraph><paragraph>Cruel</paragraph>");

    await expect(restoreSnapshotForUser(documentId, viewerId, snapshotId)).rejects.toThrow();

    await restoreSnapshotForUser(documentId, ownerId, snapshotId);
    await sleep(300);

    expect(fragmentText(clientDoc)).toBe("<paragraph>Hello</paragraph>");

    const snapshotsAfterRestore = await listSnapshotsForUser(documentId, ownerId);
    expect(snapshotsAfterRestore.length).toBe(2);
    expect(snapshotsAfterRestore[0]!.triggeredBy).not.toBe("auto");

    const rehydrated = await hydrateDocument(documentId);
    expect(fragmentText(rehydrated)).toBe("<paragraph>Hello</paragraph>");
  });
});
