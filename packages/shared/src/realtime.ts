import type { CommentThreadDTO, Role } from "./types.js";

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
  "sync:step2": (payload: { documentId: string; update: ArrayBuffer; stateVector: ArrayBuffer }) => void;
  "sync:update": (payload: { documentId: string; update: ArrayBuffer }) => void;
  "awareness:update": (payload: { documentId: string; update: ArrayBuffer }) => void;
  "awareness:query": (payload: { documentId: string }) => void;
  "document:role-changed": (payload: { documentId: string; role: Role }) => void;
  "comment:thread-upserted": (payload: { documentId: string; thread: CommentThreadDTO }) => void;
  "notification:new": () => void;
  "comment:thread-deleted": (payload: { documentId: string; threadId: string }) => void;
};

export type InterServerEvents = Record<string, never>;

export type SocketData = {
  userId: string;
};
