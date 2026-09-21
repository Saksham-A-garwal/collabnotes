import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { io, type Socket } from "socket.io-client";
import { canEditContent } from "@collabnotes/shared";
import type { ClientToServerEvents, CommentThreadDTO, Role, ServerToClientEvents } from "@collabnotes/shared";
import { loadSession } from "./authStorage.js";

export type ConnectionStatus = "connecting" | "synced" | "reconnecting" | "offline";

// Tags transactions applied from the network so the local `doc.on("update")`
// listener below doesn't echo them straight back to the server (SRS FR-13:
// the server never interprets updates, but the client must still avoid
// re-sending what it just received).
const REMOTE_ORIGIN = "realtime-remote";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// A Yjs provider (duck-typed for @tiptap/extension-collaboration-caret,
// which only needs `.awareness`) built on socket.io instead of y-websocket.
// socket.io-client's own reconnection (exponential backoff) and automatic
// buffering of emits made while disconnected together satisfy FR-16 without
// bespoke retry/queueing logic: local edits keep landing in `doc` while
// offline (FR-12), and the queued "sync:update" emits flush on reconnect,
// while a fresh, bidirectional "sync:step1"/"sync:step2" handshake on every
// (re)connect both pulls what the client missed and pushes what the server
// missed.
export class RealtimeProvider {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  private readonly documentId: string;
  private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>;

  private status: ConnectionStatus = "connecting";
  private role: Role | null = null;
  private destroyed = false;

  private statusListeners = new Set<(status: ConnectionStatus) => void>();
  private roleListeners = new Set<(role: Role) => void>();
  private errorListeners = new Set<(message: string) => void>();
  private deletedListeners = new Set<(message: string) => void>();
  private threadUpsertedListeners = new Set<(thread: CommentThreadDTO) => void>();
  private threadDeletedListeners = new Set<(threadId: string) => void>();
  private notificationListeners = new Set<() => void>();

  constructor(documentId: string, doc: Y.Doc) {
    this.documentId = documentId;
    this.doc = doc;
    this.awareness = new Awareness(doc);

    const session = loadSession();
    // Unset = same origin, which is what the single-service deployment wants.
    const wsUrl = import.meta.env.VITE_WS_URL || window.location.origin;

    this.socket = io(wsUrl, {
      auth: { token: session?.accessToken },
      reconnectionDelay: 500,
      reconnectionDelayMax: 8000,
    });

    this.socket.on("connect", this.handleConnect);
    this.socket.on("disconnect", this.handleDisconnect);
    this.socket.on("document:joined", this.handleJoined);
    this.socket.on("document:error", this.handleServerError);
    this.socket.on("document:deleted", this.handleDeleted);
    this.socket.on("document:access-revoked", this.handleDeleted);
    this.socket.on("document:role-changed", this.handleRoleChanged);
    this.socket.on("sync:step2", this.handleSyncStep2);
    this.socket.on("sync:update", this.handleRemoteUpdate);
    this.socket.on("awareness:update", this.handleRemoteAwareness);
    this.socket.on("awareness:query", this.handleAwarenessQuery);
    this.socket.on("comment:thread-upserted", this.handleThreadUpserted);
    this.socket.on("comment:thread-deleted", this.handleThreadDeleted);
    this.socket.on("notification:new", this.handleNotification);

    this.doc.on("update", this.handleLocalUpdate);
    this.awareness.on("update", this.handleLocalAwarenessUpdate);
    window.addEventListener("beforeunload", this.handleBeforeUnload);
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statusListeners.forEach((cb) => cb(status));
  }

  private handleConnect = (): void => {
    this.socket.emit("document:join", { documentId: this.documentId });
  };

  private handleDisconnect = (): void => {
    this.setStatus("reconnecting");
  };

  private handleJoined = ({ documentId, role }: { documentId: string; role: Role }): void => {
    if (documentId !== this.documentId) return;
    this.role = role;
    this.roleListeners.forEach((cb) => cb(role));

    const stateVector = Y.encodeStateVector(this.doc);
    this.socket.emit("sync:step1", { documentId: this.documentId, stateVector: toArrayBuffer(stateVector) });

    const localState = this.awareness.getLocalState();
    if (localState) {
      const update = encodeAwarenessUpdate(this.awareness, [this.doc.clientID]);
      this.socket.emit("awareness:update", { documentId: this.documentId, update: toArrayBuffer(update) });
    }
  };

  // A live role change while connected (UIUX §6): the server already applies
  // it to this socket in place, so just surface it — the editor flips between
  // editable/read-only and shows a persistent notice.
  private handleRoleChanged = ({ documentId, role }: { documentId: string; role: Role }): void => {
    if (documentId !== this.documentId) return;
    this.role = role;
    this.roleListeners.forEach((cb) => cb(role));
  };

  private handleSyncStep2 = ({
    documentId,
    update,
    stateVector,
  }: {
    documentId: string;
    update: ArrayBuffer;
    stateVector: ArrayBuffer;
  }): void => {
    if (documentId !== this.documentId) return;
    Y.applyUpdate(this.doc, new Uint8Array(update), REMOTE_ORIGIN);

    // Second half of the handshake: send the server whatever it's missing.
    // socket.io flushes emits buffered while offline *before* our
    // `document:join` is processed, so the server drops those as coming from
    // a non-member — this is what actually delivers edits made offline.
    // (An empty Yjs update encodes to 2 bytes.)
    // A viewer sends nothing. Yjs always includes the document's ENTIRE delete
    // set in an update, even when the other side already has it, so for any
    // document where text was ever deleted this "diff" is never empty. From a
    // viewer that would be refused by the server and surface as a bogus
    // "Viewers cannot edit this document" error just for opening the page.
    const missing = Y.encodeStateAsUpdate(this.doc, new Uint8Array(stateVector));
    if (this.canWrite() && missing.length > 2) {
      this.socket.emit("sync:update", { documentId: this.documentId, update: toArrayBuffer(missing) });
    }

    this.setStatus("synced");
  };

  private handleRemoteUpdate = ({ documentId, update }: { documentId: string; update: ArrayBuffer }): void => {
    if (documentId !== this.documentId) return;
    Y.applyUpdate(this.doc, new Uint8Array(update), REMOTE_ORIGIN);
  };

  private handleRemoteAwareness = ({ documentId, update }: { documentId: string; update: ArrayBuffer }): void => {
    if (documentId !== this.documentId) return;
    applyAwarenessUpdate(this.awareness, new Uint8Array(update), REMOTE_ORIGIN);
  };

  // Someone just joined and can't see us yet — re-announce our presence.
  private handleAwarenessQuery = ({ documentId }: { documentId: string }): void => {
    if (documentId !== this.documentId || !this.awareness.getLocalState()) return;
    const update = encodeAwarenessUpdate(this.awareness, [this.doc.clientID]);
    this.socket.emit("awareness:update", { documentId: this.documentId, update: toArrayBuffer(update) });
  };

  // Role unknown (not joined yet) counts as "can write": edits made while
  // offline are queued and must not be dropped. Viewers and commenters both send
  // nothing: the server would refuse it and show a bogus error.
  private canWrite(): boolean {
    return this.role === null || canEditContent(this.role);
  }

  private handleLocalUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === REMOTE_ORIGIN || !this.canWrite()) return;
    this.socket.emit("sync:update", { documentId: this.documentId, update: toArrayBuffer(update) });
  };

  private handleLocalAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin === REMOTE_ORIGIN) return;
    const changed = added.concat(updated, removed);
    const update = encodeAwarenessUpdate(this.awareness, changed);
    this.socket.emit("awareness:update", { documentId: this.documentId, update: toArrayBuffer(update) });
  };

  private handleServerError = ({ message }: { message: string }): void => {
    this.errorListeners.forEach((cb) => cb(message));
  };

  private handleDeleted = ({ message }: { message: string }): void => {
    this.deletedListeners.forEach((cb) => cb(message));
  };

  private handleThreadUpserted = ({ documentId, thread }: { documentId: string; thread: CommentThreadDTO }): void => {
    if (documentId !== this.documentId) return;
    this.threadUpsertedListeners.forEach((cb) => cb(thread));
  };

  private handleThreadDeleted = ({ documentId, threadId }: { documentId: string; threadId: string }): void => {
    if (documentId !== this.documentId) return;
    this.threadDeletedListeners.forEach((cb) => cb(threadId));
  };

  private handleNotification = (): void => {
    this.notificationListeners.forEach((cb) => cb());
  };

  private handleBeforeUnload = (): void => {
    removeAwarenessStates(this.awareness, [this.doc.clientID], "window unload");
  };

  setLocalUser(user: { name: string; color: string }): void {
    this.awareness.setLocalStateField("user", user);
  }

  onStatusChange(cb: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  onRoleChange(cb: (role: Role) => void): () => void {
    this.roleListeners.add(cb);
    if (this.role) cb(this.role);
    return () => this.roleListeners.delete(cb);
  }

  onError(cb: (message: string) => void): () => void {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }

  onDeleted(cb: (message: string) => void): () => void {
    this.deletedListeners.add(cb);
    return () => this.deletedListeners.delete(cb);
  }

  onThreadUpserted(cb: (thread: CommentThreadDTO) => void): () => void {
    this.threadUpsertedListeners.add(cb);
    return () => this.threadUpsertedListeners.delete(cb);
  }

  onThreadDeleted(cb: (threadId: string) => void): () => void {
    this.threadDeletedListeners.add(cb);
    return () => this.threadDeletedListeners.delete(cb);
  }

  onNotification(cb: () => void): () => void {
    this.notificationListeners.add(cb);
    return () => this.notificationListeners.delete(cb);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.handleBeforeUnload();
    window.removeEventListener("beforeunload", this.handleBeforeUnload);
    this.socket.emit("document:leave", { documentId: this.documentId });
    this.socket.disconnect();
    this.doc.off("update", this.handleLocalUpdate);
    this.awareness.off("update", this.handleLocalAwarenessUpdate);
    this.statusListeners.clear();
    this.roleListeners.clear();
    this.errorListeners.clear();
    this.deletedListeners.clear();
    this.threadUpsertedListeners.clear();
    this.threadDeletedListeners.clear();
    this.notificationListeners.clear();
  }
}
