import crypto from "node:crypto";
import * as Y from "yjs";
import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  CommentThreadDTO,
  InterServerEvents,
  Role,
  ServerToClientEvents,
  SocketData,
} from "@collabnotes/shared";
import { env } from "../config/env.js";
import { redisPub, redisSub } from "../lib/redis.js";
import { appendUpdate, createSnapshot, hydrateDocument } from "./persistence.js";
import { buildRestoreDelta } from "./restoreContent.js";
import { createSearchIndexer } from "./searchIndex.js";

const INSTANCE_ID = crypto.randomUUID();

type IoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

type Member = { userId: string; role: Role };

type Room = {
  doc: Y.Doc;
  members: Map<string, Member>;
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
const userRoom = (userId: string): string => `user:${userId}`;
const NOTIFY_CHANNEL = "notifications";

function commentsChannel(documentId: string): string {
  return `doc:${documentId}:comments`;
}
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function createRoomManager(io: IoServer) {
  const rooms = new Map<string, Room>();
  const pendingRooms = new Map<string, Promise<Room>>();
  const channelHandlers = new Map<string, (raw: string) => void>();
  const dirty = new Set<string>();
  const searchIndexer = createSearchIndexer((documentId) => rooms.get(documentId)?.doc);

  redisSub.on("message", (channel: string, raw: string) => {
    channelHandlers.get(channel)?.(raw);
  });

  channelHandlers.set(NOTIFY_CHANNEL, (raw) => {
    const msg = JSON.parse(raw) as { instanceId: string; userIds: string[] };
    if (msg.instanceId === INSTANCE_ID) return;
    for (const userId of msg.userIds) io.to(userRoom(userId)).emit("notification:new");
  });
  if (env.REDIS_RELAY) {
    redisSub.subscribe(NOTIFY_CHANNEL).catch((err: unknown) => {
      console.warn(JSON.stringify({ level: "warn", message: "redis subscribe failed for notifications; continuing single-instance", error: (err as Error).message }));
    });
  }

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

  async function publishJson(channel: string, message: object): Promise<void> {
    if (!env.REDIS_RELAY) return;
    try {
      await redisPub.publish(channel, JSON.stringify({ instanceId: INSTANCE_ID, ...message }));
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

      channelHandlers.set(updatesChannel(documentId), (raw) => {
        const { instanceId, dataBase64 } = JSON.parse(raw) as RelayEnvelope;
        if (instanceId === INSTANCE_ID) return;
        const update = new Uint8Array(Buffer.from(dataBase64, "base64"));
        Y.applyUpdate(room.doc, update, "redis");
        dirty.add(documentId);
        searchIndexer.schedule(documentId);
        io.to(roomName(documentId)).emit("sync:update", { documentId, update: toArrayBuffer(update) });
      });
      channelHandlers.set(awarenessChannel(documentId), (raw) => {
        const { instanceId, dataBase64 } = JSON.parse(raw) as RelayEnvelope;
        if (instanceId === INSTANCE_ID) return;
        const update = new Uint8Array(Buffer.from(dataBase64, "base64"));
        io.to(roomName(documentId)).emit("awareness:update", { documentId, update: toArrayBuffer(update) });
      });
      channelHandlers.set(commentsChannel(documentId), (raw) => {
        const msg = JSON.parse(raw) as { instanceId: string; kind: "upserted" | "deleted"; thread?: CommentThreadDTO; threadId?: string };
        if (msg.instanceId === INSTANCE_ID) return;
        if (msg.kind === "upserted" && msg.thread) {
          io.to(roomName(documentId)).emit("comment:thread-upserted", { documentId, thread: msg.thread });
        } else if (msg.kind === "deleted" && msg.threadId) {
          io.to(roomName(documentId)).emit("comment:thread-deleted", { documentId, threadId: msg.threadId });
        }
      });
      if (env.REDIS_RELAY) {
        try {
          await redisSub.subscribe(updatesChannel(documentId), awarenessChannel(documentId), commentsChannel(documentId));
        } catch (err) {
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

    queryAwareness(socket: Socket, documentId: string): void {
      socket.to(roomName(documentId)).emit("awareness:query", { documentId });
    },

    leave(socket: Socket, documentId: string): void {
      rooms.get(documentId)?.members.delete(socket.id);
      socket.leave(roomName(documentId));
    },

    isUserPresent(documentId: string, userId: string): boolean {
      const room = rooms.get(documentId);
      if (!room) return false;
      for (const member of room.members.values()) if (member.userId === userId) return true;
      return false;
    },

    getMember(documentId: string, socketId: string): Member | undefined {
      return rooms.get(documentId)?.members.get(socketId);
    },

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

    async applyUpdate(documentId: string, update: Uint8Array, fromSocketId: string): Promise<void> {
      const room = rooms.get(documentId);
      if (!room) return;
      Y.applyUpdate(room.doc, update, "socket");
      dirty.add(documentId);
      searchIndexer.schedule(documentId);
      await appendUpdate(documentId, update);
      io.to(roomName(documentId))
        .except(fromSocketId)
        .emit("sync:update", { documentId, update: toArrayBuffer(update) });
      await publish(updatesChannel(documentId), update);
    },

    async restoreSnapshot(documentId: string, snapshotBytes: Uint8Array, triggeredBy: string): Promise<void> {
      const room = await getOrCreateRoom(documentId);
      const delta = buildRestoreDelta(room.doc, snapshotBytes);

      await appendUpdate(documentId, delta);
      io.to(roomName(documentId)).emit("sync:update", { documentId, update: toArrayBuffer(delta) });
      await publish(updatesChannel(documentId), delta);

      await createSnapshot(documentId, room.doc, triggeredBy);
      dirty.delete(documentId);
      searchIndexer.schedule(documentId);
    },

    joinPersonalRoom(socket: Socket, userId: string): void {
      void socket.join(userRoom(userId));
    },

    async notifyUsers(userIds: string[]): Promise<void> {
      for (const userId of userIds) io.to(userRoom(userId)).emit("notification:new");
      await publishJson(NOTIFY_CHANNEL, { userIds });
    },

    async broadcastThreadUpserted(documentId: string, thread: CommentThreadDTO): Promise<void> {
      io.to(roomName(documentId)).emit("comment:thread-upserted", { documentId, thread });
      await publishJson(commentsChannel(documentId), { kind: "upserted", thread });
    },

    async broadcastThreadDeleted(documentId: string, threadId: string): Promise<void> {
      io.to(roomName(documentId)).emit("comment:thread-deleted", { documentId, threadId });
      await publishJson(commentsChannel(documentId), { kind: "deleted", threadId });
    },

    searchIndex: searchIndexer,

    getDirtyRoomIds(): string[] {
      return [...dirty];
    },

    async snapshotIfDirty(documentId: string): Promise<void> {
      if (!dirty.has(documentId)) return;
      const room = rooms.get(documentId);
      if (!room) return;
      await createSnapshot(documentId, room.doc, null);
      dirty.delete(documentId);
    },

    async relayAwareness(documentId: string, update: Uint8Array, fromSocketId: string): Promise<void> {
      io.to(roomName(documentId))
        .except(fromSocketId)
        .emit("awareness:update", { documentId, update: toArrayBuffer(update) });
      await publish(awarenessChannel(documentId), update);
    },

    async disconnectRoom(documentId: string, message: string): Promise<void> {
      io.to(roomName(documentId)).emit("document:deleted", { documentId, message });
      const sockets = await io.in(roomName(documentId)).fetchSockets();
      for (const s of sockets) s.disconnect(true);
      rooms.delete(documentId);
    },

    updateMemberRole(documentId: string, userId: string, role: Role): void {
      const room = rooms.get(documentId);
      if (!room) return;
      for (const [socketId, member] of room.members) {
        if (member.userId !== userId) continue;
        member.role = role;
        io.sockets.sockets.get(socketId)?.emit("document:role-changed", { documentId, role });
      }
    },

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
