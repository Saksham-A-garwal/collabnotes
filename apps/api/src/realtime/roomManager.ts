import crypto from "node:crypto";
import * as Y from "yjs";
import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  Role,
  ServerToClientEvents,
  SocketData,
} from "@collabnotes/shared";
import { env } from "../config/env.js";
import { redisPub, redisSub } from "../lib/redis.js";
import { appendUpdate, createSnapshot, hydrateDocument } from "./persistence.js";
import { buildRestoreDelta } from "./restoreContent.js";

// One id per running process, stamped on every Redis-relayed message so a
// server can recognize (and skip) its own publish coming back through its
// own subscription — Architecture §6.1/§6.3's cross-instance relay, made
// concrete.
const INSTANCE_ID = crypto.randomUUID();

type IoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

type Member = { userId: string; role: Role };

type Room = {
  doc: Y.Doc;
  members: Map<string, Member>; // socket.id -> member
};

type RelayEnvelope = { instanceId: string; dataBase64: string };

function roomName(documentId: string): string {
  return `doc:${documentId}`;
}
function updatesChannel(documentId: string): string {
  return `doc:${documentId}:updates`;
}
function awarenessChannel(documentId: string): string {
  return `doc:${documentId}:awareness`;
}
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function createRoomManager(io: IoServer) {
  const rooms = new Map<string, Room>();
  const pendingRooms = new Map<string, Promise<Room>>();
  const channelHandlers = new Map<string, (raw: string) => void>();
  // Documents with content changes since their last snapshot — the periodic
  // job (snapshotJob.ts, FR-23a) only snapshots rooms in here, and clears
  // them afterward.
  const dirty = new Set<string>();

  redisSub.on("message", (channel: string, raw: string) => {
    channelHandlers.get(channel)?.(raw);
  });

  // Redis is a transient bus, not a source of truth (Architecture §11): the
  // update is already applied, persisted and relayed to this instance's own
  // sockets before we get here. So a Redis failure — hosted-quota exhausted,
  // network blip, provider outage — must degrade to "single-instance mode",
  // never throw. Left to propagate, a failed publish rejects inside an async
  // socket handler, and an unhandled rejection kills the whole Node process
  // and every live session with it.
  async function publish(channel: string, data: Uint8Array): Promise<void> {
    if (!env.REDIS_RELAY) return;
    const envelope: RelayEnvelope = {
      instanceId: INSTANCE_ID,
      dataBase64: Buffer.from(data).toString("base64"),
    };
    try {
      await redisPub.publish(channel, JSON.stringify(envelope));
    } catch (err) {
      console.warn(
        JSON.stringify({ level: "warn", message: "redis publish failed; continuing single-instance", channel, error: (err as Error).message }),
      );
    }
  }

  async function getOrCreateRoom(documentId: string): Promise<Room> {
    const existing = rooms.get(documentId);
    if (existing) return existing;

    const pending = pendingRooms.get(documentId);
    if (pending) return pending;

    const creation = (async (): Promise<Room> => {
      const doc = await hydrateDocument(documentId);
      const room: Room = { doc, members: new Map() };
      rooms.set(documentId, room);

      // Subscribed once per room and kept open for the process's lifetime —
      // Architecture §6.3/§13 explicitly defers unsubscribe-on-empty as an
      // optimization this project's scale doesn't need yet.
      channelHandlers.set(updatesChannel(documentId), (raw) => {
        const { instanceId, dataBase64 } = JSON.parse(raw) as RelayEnvelope;
        if (instanceId === INSTANCE_ID) return;
        const update = new Uint8Array(Buffer.from(dataBase64, "base64"));
        Y.applyUpdate(room.doc, update, "redis");
        dirty.add(documentId);
        io.to(roomName(documentId)).emit("sync:update", { documentId, update: toArrayBuffer(update) });
      });
      channelHandlers.set(awarenessChannel(documentId), (raw) => {
        const { instanceId, dataBase64 } = JSON.parse(raw) as RelayEnvelope;
        if (instanceId === INSTANCE_ID) return;
        const update = new Uint8Array(Buffer.from(dataBase64, "base64"));
        io.to(roomName(documentId)).emit("awareness:update", { documentId, update: toArrayBuffer(update) });
      });
      if (env.REDIS_RELAY) {
        try {
          await redisSub.subscribe(updatesChannel(documentId), awarenessChannel(documentId));
        } catch (err) {
          // Opening a document must not depend on Redis being reachable.
          console.warn(
            JSON.stringify({ level: "warn", message: "redis subscribe failed; continuing single-instance", documentId, error: (err as Error).message }),
          );
        }
      }

      return room;
    })();

    pendingRooms.set(documentId, creation);
    try {
      return await creation;
    } finally {
      pendingRooms.delete(documentId);
    }
  }

  return {
    async join(socket: Socket, documentId: string, userId: string, role: Role): Promise<void> {
      const room = await getOrCreateRoom(documentId);
      room.members.set(socket.id, { userId, role });
      await socket.join(roomName(documentId));
    },

    // Ask everyone already in the room to re-announce their presence to the
    // newcomer. Local room only — peers on another server instance won't hear
    // this (the Redis relay carries awareness *updates*, not queries); they'd
    // still appear on their next cursor move or Yjs's ~15s awareness renewal.
    queryAwareness(socket: Socket, documentId: string): void {
      socket.to(roomName(documentId)).emit("awareness:query", { documentId });
    },

    leave(socket: Socket, documentId: string): void {
      rooms.get(documentId)?.members.delete(socket.id);
      socket.leave(roomName(documentId));
    },

    getMember(documentId: string, socketId: string): Member | undefined {
      return rooms.get(documentId)?.members.get(socketId);
    },

    // FR-16: server responds to the client's state vector with only what
    // it's missing, not the whole document.
    stateVectorDiff(documentId: string, clientStateVector: Uint8Array): Uint8Array {
      const room = rooms.get(documentId);
      if (!room) throw new Error(`Room ${documentId} not joined`);
      return Y.encodeStateAsUpdate(room.doc, clientStateVector);
    },

    stateVector(documentId: string): Uint8Array {
      const room = rooms.get(documentId);
      if (!room) throw new Error(`Room ${documentId} not joined`);
      return Y.encodeStateVector(room.doc);
    },

    // FR-13: apply, persist, relay verbatim — never interpreted or reordered.
    async applyUpdate(documentId: string, update: Uint8Array, fromSocketId: string): Promise<void> {
      const room = rooms.get(documentId);
      if (!room) return;
      Y.applyUpdate(room.doc, update, "socket");
      dirty.add(documentId);
      await appendUpdate(documentId, update);
      io.to(roomName(documentId))
        .except(fromSocketId)
        .emit("sync:update", { documentId, update: toArrayBuffer(update) });
      await publish(updatesChannel(documentId), update);
    },

    // FR-23(b)/FR-25: restore is expressed as one ordinary delete+insert
    // transaction (restoreContent.ts) so it can go through the exact same
    // persist/relay pipeline as applyUpdate — every connected client picks
    // it up as a normal sync:update, live, no reload (FR-25's requirement).
    // Immediately writes a new snapshot whose cutoff is "now," which is
    // what stops a future hydration from replaying the abandoned edits
    // back in.
    async restoreSnapshot(documentId: string, snapshotBytes: Uint8Array, triggeredBy: string): Promise<void> {
      const room = await getOrCreateRoom(documentId);
      const delta = buildRestoreDelta(room.doc, snapshotBytes);

      await appendUpdate(documentId, delta);
      io.to(roomName(documentId)).emit("sync:update", { documentId, update: toArrayBuffer(delta) });
      await publish(updatesChannel(documentId), delta);

      await createSnapshot(documentId, room.doc, triggeredBy);
      dirty.delete(documentId);
    },

    // FR-23(a): the periodic job snapshots only documents with changes
    // since their last snapshot.
    getDirtyRoomIds(): string[] {
      return [...dirty];
    },

    async snapshotIfDirty(documentId: string): Promise<void> {
      if (!dirty.has(documentId)) return;
      const room = rooms.get(documentId);
      if (!room) return;
      await createSnapshot(documentId, room.doc, null); // null = automatic (FR-23a)
      dirty.delete(documentId);
    },

    // FR-15: relayed opaque and unpersisted, on its own channel.
    async relayAwareness(documentId: string, update: Uint8Array, fromSocketId: string): Promise<void> {
      io.to(roomName(documentId))
        .except(fromSocketId)
        .emit("awareness:update", { documentId, update: toArrayBuffer(update) });
      await publish(awarenessChannel(documentId), update);
    },

    // FR-11: notify, then force-disconnect every socket in the room.
    async disconnectRoom(documentId: string, message: string): Promise<void> {
      io.to(roomName(documentId)).emit("document:deleted", { documentId, message });
      const sockets = await io.in(roomName(documentId)).fetchSockets();
      for (const s of sockets) s.disconnect(true);
      rooms.delete(documentId);
    },

    // A role change (either direction) for someone who's connected right now.
    // Applied in place rather than disconnecting them: server-side
    // enforcement is immediate either way (applyUpdate/FR-17 consults
    // member.role on every message, so the very next write from a
    // downgraded socket is rejected), and the client gets told so it can
    // disable its toolbar and explain why (UIUX §6) instead of being
    // stranded — socket.io does not auto-reconnect after a server-initiated
    // disconnect. Full removal still uses kickUser (FR-14).
    updateMemberRole(documentId: string, userId: string, role: Role): void {
      const room = rooms.get(documentId);
      if (!room) return;
      for (const [socketId, member] of room.members) {
        if (member.userId !== userId) continue;
        member.role = role;
        io.sockets.sockets.get(socketId)?.emit("document:role-changed", { documentId, role });
      }
    },

    // FR-14: remove one user's socket(s) from the room within one round trip.
    kickUser(documentId: string, userId: string, message: string): void {
      const room = rooms.get(documentId);
      if (!room) return;
      for (const [socketId, member] of room.members) {
        if (member.userId !== userId) continue;
        const socket = io.sockets.sockets.get(socketId);
        socket?.emit("document:access-revoked", { documentId, message });
        socket?.disconnect(true);
        room.members.delete(socketId);
      }
    },
  };
}

export type RoomManager = ReturnType<typeof createRoomManager>;
