import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@collabnotes/shared";
import { env } from "../config/env.js";
import { findDocumentById, getUserRole } from "../db/queries/documents.js";
import { documentEvents } from "../lib/events.js";
import { createRoomManager, type RoomManager } from "./roomManager.js";
import { startSnapshotJob } from "./snapshotJob.js";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// Set once attachRealtime runs (before server.listen(), so before any
// request could reach the snapshots REST routes that need it).
let roomManagerInstance: RoomManager | null = null;

export function getRoomManager(): RoomManager {
  if (!roomManagerInstance) throw new Error("Realtime layer not attached yet");
  return roomManagerInstance;
}

// Wires the socket.io server: JWT handshake auth (Architecture §8 — verified
// once at connect time, not per message), document room join/leave with a
// BR-2 access check, the Yjs sync handshake, and update/awareness relay.
export function attachRealtime(httpServer: HttpServer) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: {
        origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
        credentials: true,
      },
    },
  );

  io.use((socket, next) => {
    const token = socket.handshake.auth?.["token"];
    if (typeof token !== "string") {
      next(new Error("UNAUTHENTICATED"));
      return;
    }
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error("UNAUTHENTICATED"));
    }
  });

  const roomManager = createRoomManager(io);
  roomManagerInstance = roomManager;
  startSnapshotJob(roomManager);

  documentEvents.on("document:deleted", (documentId) => {
    roomManager.disconnectRoom(documentId, "This document was deleted.").catch((err: unknown) => {
      console.error(
        JSON.stringify({
          level: "error",
          message: "disconnectRoom failed",
          documentId,
          error: (err as Error).message,
        }),
      );
    });
  });

  io.on("connection", (socket) => {
    const joinedDocuments = new Set<string>();

    socket.on("document:join", async ({ documentId }) => {
      try {
        const doc = await findDocumentById(documentId);
        const role = doc ? await getUserRole(documentId, socket.data.userId) : null;
        if (!doc || !role) {
          socket.emit("document:error", {
            documentId,
            code: "DOCUMENT_NOT_FOUND",
            message: "Document not found.",
          });
          return;
        }
        await roomManager.join(socket, documentId, socket.data.userId, role);
        joinedDocuments.add(documentId);
        socket.emit("document:joined", { documentId, role });
      } catch (err) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "document:join failed",
            documentId,
            error: (err as Error).message,
          }),
        );
        socket.emit("document:error", {
          documentId,
          code: "INTERNAL_ERROR",
          message: "Couldn't join document.",
        });
      }
    });

    socket.on("document:leave", ({ documentId }) => {
      roomManager.leave(socket, documentId);
      joinedDocuments.delete(documentId);
    });

    socket.on("sync:step1", ({ documentId, stateVector }) => {
      const member = roomManager.getMember(documentId, socket.id);
      if (!member) return;
      const update = roomManager.stateVectorDiff(documentId, new Uint8Array(stateVector));
      socket.emit("sync:step2", { documentId, update: toArrayBuffer(update) });
    });

    // FR-17: reject (and log) any write from a socket whose role is viewer —
    // enforced here regardless of what the UI allows a Viewer to attempt.
    socket.on("sync:update", async ({ documentId, update }) => {
      const member = roomManager.getMember(documentId, socket.id);
      if (!member) return;

      if (member.role === "viewer") {
        console.warn(
          JSON.stringify({
            level: "warn",
            message: "rejected update from viewer",
            documentId,
            userId: socket.data.userId,
          }),
        );
        socket.emit("document:error", {
          documentId,
          code: "FORBIDDEN",
          message: "Viewers cannot edit this document.",
        });
        return;
      }

      await roomManager.applyUpdate(documentId, new Uint8Array(update), socket.id);
    });

    socket.on("awareness:update", async ({ documentId, update }) => {
      const member = roomManager.getMember(documentId, socket.id);
      if (!member) return;
      await roomManager.relayAwareness(documentId, new Uint8Array(update), socket.id);
    });

    socket.on("disconnect", () => {
      for (const documentId of joinedDocuments) roomManager.leave(socket, documentId);
    });
  });

  return io;
}
