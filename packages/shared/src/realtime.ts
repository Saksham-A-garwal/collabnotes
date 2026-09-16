import type { Role } from "./types.js";

// socket.io event contract for the realtime sync core (Phase 2). Replaces
// the raw-`ws` byte-envelope sketched in SRS §5.5 (0x00-0x03) — socket.io's
// own named-event multiplexing does that job, so each concern gets its own
// event instead of a leading type byte. Semantics are unchanged: FR-12
// (optimistic local apply), FR-13 (opaque relay, never interpreted),
// FR-15 (awareness is a separate, unpersisted channel), FR-16 (state-vector
// diff sync), FR-17 (server-side viewer write rejection).

export type ClientToServerEvents = {
  "document:join": (payload: { documentId: string }) => void;
  "document:leave": (payload: { documentId: string }) => void;
  "sync:step1": (payload: { documentId: string; stateVector: ArrayBuffer }) => void;
  "sync:update": (payload: { documentId: string; update: ArrayBuffer }) => void;
  "awareness:update": (payload: { documentId: string; update: ArrayBuffer }) => void;
};

export type ServerToClientEvents = {
  "document:joined": (payload: { documentId: string; role: Role }) => void;
  "document:error": (payload: { documentId: string; code: string; message: string }) => void;
  "document:deleted": (payload: { documentId: string; message: string }) => void;
  "document:access-revoked": (payload: { documentId: string; message: string }) => void;
  "sync:step2": (payload: { documentId: string; update: ArrayBuffer }) => void;
  "sync:update": (payload: { documentId: string; update: ArrayBuffer }) => void;
  "awareness:update": (payload: { documentId: string; update: ArrayBuffer }) => void;
};

export type InterServerEvents = Record<string, never>;

export type SocketData = {
  userId: string;
};
