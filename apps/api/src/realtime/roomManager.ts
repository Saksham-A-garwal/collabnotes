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

  async function publish(channel: string, data: Uint8Array): Promise<void> {
    const envelope: RelayEnvelope = {
      instanceId: INSTANCE_ID,
      dataBase64: Buffer.from(data).toString("base64"),
    };
    await redisPub.publish(channel, JSON.stringify(envelope));
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
      await redisSub.subscribe(updatesChannel(documentId), awarenessChannel(documentId));

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
