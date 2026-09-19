import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { io as ioClient, type Socket } from "socket.io-client";
import * as Y from "yjs";
import { env } from "../../config/env.js";
import { pool } from "../../db/pool.js";
import { attachRealtime } from "../index.js";

// Shared scaffolding for the realtime test files: an in-process server, a
// throwaway document with owner/editor/viewer users, and a TestClient that
// speaks the sync protocol exactly the way apps/web's RealtimeProvider does
// (join on connect, state-vector handshake, always-emit local updates,
// origin-tagged remote applies).

export const REMOTE = "test-remote";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await sleep(25);
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

export type Fixture = {
  server: HttpServer;
  baseUrl: string;
  documentId: string;
  ownerId: string;
  editorId: string;
  viewerId: string;
  clients: TestClient[];
  cleanup: () => Promise<void>;
};

export async function createFixture(tag: string): Promise<Fixture> {
  const mkUser = async (role: string): Promise<string> => {
    const r = await pool.query<{ id: string }>(
      "INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id",
      [`${tag}-${role}@test.local`, "x", `${tag} ${role}`],
    );
    return r.rows[0]!.id;
  };
  const ownerId = await mkUser("owner");
  const editorId = await mkUser("editor");
  const viewerId = await mkUser("viewer");

  const doc = await pool.query<{ id: string }>(
    "INSERT INTO documents (owner_id) VALUES ($1) RETURNING id",
    [ownerId],
  );
  const documentId = doc.rows[0]!.id;
  await pool.query("INSERT INTO document_access (document_id, user_id, role) VALUES ($1, $2, 'editor')", [
    documentId,
    editorId,
  ]);
  await pool.query("INSERT INTO document_access (document_id, user_id, role) VALUES ($1, $2, 'viewer')", [
    documentId,
    viewerId,
  ]);

  const server = createServer();
  attachRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;

  const clients: TestClient[] = [];
  return {
    server,
    baseUrl,
    documentId,
    ownerId,
    editorId,
    viewerId,
    clients,
    cleanup: async () => {
      for (const c of clients) c.socket.disconnect();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await pool.query("DELETE FROM documents WHERE id = $1", [documentId]);
      await pool.query("DELETE FROM users WHERE id = ANY($1)", [[ownerId, editorId, viewerId]]);
    },
  };
}

export class TestClient {
  readonly doc = new Y.Doc();
  readonly socket: Socket;
  role: string | null = null;
  synced = false;
  events: { name: string; payload: unknown }[] = [];

  constructor(
    private readonly fixture: Fixture,
    userId: string,
  ) {
    const token = jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: "5m" });
    this.socket = ioClient(fixture.baseUrl, { auth: { token }, autoConnect: false, reconnection: false });
    fixture.clients.push(this);

    this.socket.on("connect", () => {
      this.synced = false;
      this.socket.emit("document:join", { documentId: fixture.documentId });
    });
    this.socket.on("document:joined", ({ role }: { role: string }) => {
      this.role = role;
      this.socket.emit("sync:step1", {
        documentId: fixture.documentId,
        stateVector: toArrayBuffer(Y.encodeStateVector(this.doc)),
      });
    });
    this.socket.on(
      "sync:step2",
      ({ update, stateVector }: { update: ArrayBuffer; stateVector?: ArrayBuffer }) => {
        Y.applyUpdate(this.doc, new Uint8Array(update), REMOTE);
        // Bidirectional handshake: send the server whatever it's missing.
        if (stateVector) {
          const diff = Y.encodeStateAsUpdate(this.doc, new Uint8Array(stateVector));
          if (diff.length > 2) {
            this.socket.emit("sync:update", { documentId: fixture.documentId, update: toArrayBuffer(diff) });
          }
        }
        this.synced = true;
      },
    );
    this.socket.on("sync:update", ({ update }: { update: ArrayBuffer }) =>
      Y.applyUpdate(this.doc, new Uint8Array(update), REMOTE),
    );
    for (const name of ["document:error", "document:deleted", "document:access-revoked", "document:role-changed"]) {
      this.socket.on(name, (payload: unknown) => this.events.push({ name, payload }));
    }
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE) return;
      this.socket.emit("sync:update", { documentId: fixture.documentId, update: toArrayBuffer(update) });
    });
  }

  async connect(): Promise<void> {
    this.socket.connect();
    await waitFor(() => this.synced);
  }

  text(): string {
    return this.doc.getText("content").toString();
  }

  insert(text: string): void {
    const t = this.doc.getText("content");
    t.insert(t.length, text);
  }
}
