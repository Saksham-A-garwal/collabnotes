import type { CommentThreadDTO, Role } from "./types.js";

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
  // `stateVector` is the server's own state vector, so the client can answer
  // with exactly what the server is missing (edits made while offline). Yjs
  // sync is bidirectional — a one-way "here's what you lack" handshake
  // silently drops the client's offline work.
  "sync:step2": (payload: { documentId: string; update: ArrayBuffer; stateVector: ArrayBuffer }) => void;
  "sync:update": (payload: { documentId: string; update: ArrayBuffer }) => void;
  "awareness:update": (payload: { documentId: string; update: ArrayBuffer }) => void;
  // Sent to existing members when someone joins: the server relays awareness
  // opaquely and never stores it, so without this a new joiner wouldn't see
  // who's already here until they next moved their cursor.
  "awareness:query": (payload: { documentId: string }) => void;
  // A live role change (upgrade or downgrade) for a still-connected member,
  // applied in place server-side — see roomManager.updateMemberRole.
  "document:role-changed": (payload: { documentId: string; role: Role }) => void;
  // Comment threads changed (created, replied to, edited, resolved, reopened). Carries
  // the whole thread so clients just replace their copy; `deleted` removes one.
  "comment:thread-upserted": (payload: { documentId: string; thread: CommentThreadDTO }) => void;
  // Something new for you in the notification list (sent to all of your open connections).
  "notification:new": () => void;
  "comment:thread-deleted": (payload: { documentId: string; threadId: string }) => void;
};

export type InterServerEvents = Record<string, never>;

export type SocketData = {
  userId: string;
};
