import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import {
  canEditContent,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from "@collabnotes/shared";
import { env } from "../config/env.js";
import { findDocumentById, getUserRole } from "../db/queries/documents.js";
import { documentEvents } from "../lib/events.js";
import {
  MAX_AWARENESS_BYTES,
  MAX_JOINED_DOCUMENTS,
  MAX_UPDATE_BYTES,
  TokenBucket,
  parseBinary,
  parseDocumentId,
} from "./guards.js";
import { createRoomManager, type RoomManager } from "./roomManager.js";
import { startSnapshotJob } from "./snapshotJob.js";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const logError = (message: string, extra: Record<string, unknown>): void =>
  console.error(JSON.stringify({ level: "error", message, ...extra }));

let roomManagerInstance: RoomManager | null = null;

export function getRoomManager(): RoomManager {
  if (!roomManagerInstance) throw new Error("Realtime layer not attached yet");
  return roomManagerInstance;
}

export function attachRealtime(httpServer: HttpServer) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: {
        origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
        credentials: false,
      },
      maxHttpBufferSize: MAX_UPDATE_BYTES,
    },
  );

  io.use((socket, next) => {
    const token = socket.handshake.auth?.["token"];
    if (typeof token !== "string") {
      next(new Error("UNAUTHENTICATED"));
      return;
    }
    try {
      const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as { sub: string };
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
      logError("disconnectRoom failed", { documentId, error: (err as Error).message });
    });
  });

  io.on("connection", (socket) => {
    const joinedDocuments = new Set<string>();
    roomManager.joinPersonalRoom(socket, socket.data.userId);

    const overall = new TokenBucket(1000, 300);
    const awarenessBudget = new TokenBucket(120, 60);
    const joinBudget = new TokenBucket(40, 2);

    function guarded<P>(event: string, kind: "join" | "awareness" | "other", handle: (payload: P) => void | Promise<void>) {
      return (payload: P): void => {
        if (!overall.take() || (kind === "join" && !joinBudget.take())) {
          console.warn(JSON.stringify({ level: "warn", message: "socket flood; disconnecting", event, userId: socket.data.userId }));
          socket.disconnect(true);
          return;
        }
        if (kind === "awareness" && !awarenessBudget.take()) return;
        Promise.resolve()
          .then(() => handle(payload))
          .catch((err: unknown) => {
            logError(`socket handler failed: ${event}`, { userId: socket.data.userId, error: (err as Error)?.message });
          });
      };
    }

    const reject = (documentId: string, code: string, message: string): void => {
      socket.emit("document:error", { documentId, code, message });
    };

    socket.on(
      "document:join",
      guarded<unknown>("document:join", "join", async (payload) => {
        const documentId = parseDocumentId(payload);
        if (!documentId) {
          reject("", "VALIDATION_ERROR", "Invalid request.");
          return;
        }
        if (!joinedDocuments.has(documentId) && joinedDocuments.size >= MAX_JOINED_DOCUMENTS) {
          reject(documentId, "FORBIDDEN", "Too many documents open at once.");
          return;
        }

        try {
          const doc = await findDocumentById(documentId);
          const role = doc ? await getUserRole(documentId, socket.data.userId) : null;
          if (!doc || !role) {
            reject(documentId, "DOCUMENT_NOT_FOUND", "Document not found.");
            return;
          }
          await roomManager.join(socket, documentId, socket.data.userId, role);
          joinedDocuments.add(documentId);
          socket.emit("document:joined", { documentId, role });
          roomManager.queryAwareness(socket, documentId);
        } catch (err) {
          logError("document:join failed", { documentId, error: (err as Error).message });
          reject(documentId, "INTERNAL_ERROR", "Couldn't join document.");
        }
      }),
    );

    socket.on(
      "document:leave",
      guarded<unknown>("document:leave", "other", (payload) => {
        const documentId = parseDocumentId(payload);
        if (!documentId) return;
        roomManager.leave(socket, documentId);
        joinedDocuments.delete(documentId);
      }),
    );

    socket.on(
      "sync:step1",
      guarded<unknown>("sync:step1", "other", (payload) => {
        const documentId = parseDocumentId(payload);
        const stateVector = parseBinary(payload, MAX_UPDATE_BYTES);
        if (!documentId || !stateVector) return;
        const member = roomManager.getMember(documentId, socket.id);
        if (!member) return;
        const update = roomManager.stateVectorDiff(documentId, stateVector);
        socket.emit("sync:step2", {
          documentId,
          update: toArrayBuffer(update),
          stateVector: toArrayBuffer(roomManager.stateVector(documentId)),
        });
      }),
    );

    socket.on(
      "sync:update",
      guarded<unknown>("sync:update", "other", async (payload) => {
        const documentId = parseDocumentId(payload);
        if (!documentId) return;
        const member = roomManager.getMember(documentId, socket.id);
        if (!member) return;

        if (!canEditContent(member.role)) {
          console.warn(
            JSON.stringify({
              level: "warn",
              message: "rejected update from a read-only role",
              role: member.role,
              documentId,
              userId: socket.data.userId,
            }),
          );
          reject(documentId, "FORBIDDEN", "You have read-only access to this document.");
          return;
        }

        const update = parseBinary(payload, MAX_UPDATE_BYTES);
        if (!update) {
          reject(documentId, "VALIDATION_ERROR", "Update rejected.");
          return;
        }

        try {
          await roomManager.applyUpdate(documentId, update, socket.id);
        } catch (err) {
          logError("rejected malformed update", { documentId, userId: socket.data.userId, error: (err as Error)?.message });
          reject(documentId, "VALIDATION_ERROR", "Update rejected.");
        }
      }),
    );

    socket.on(
      "awareness:update",
      guarded<unknown>("awareness:update", "awareness", async (payload) => {
        const documentId = parseDocumentId(payload);
        const update = parseBinary(payload, MAX_AWARENESS_BYTES);
        if (!documentId || !update) return;
        const member = roomManager.getMember(documentId, socket.id);
        if (!member) return;
        await roomManager.relayAwareness(documentId, update, socket.id);
      }),
    );

    socket.on("disconnect", () => {
      for (const documentId of joinedDocuments) roomManager.leave(socket, documentId);
    });
  });

  return io;
}
