import { EventEmitter } from "node:events";

// Minimal typed event bus so document CRUD (this phase) and the WS room
// manager (Phase 2) can stay decoupled. FR-11 requires that deleting a
// document force-disconnects its live room; the room manager subscribes to
// "document:deleted" once it exists instead of documents.service.ts
// reaching into WS internals directly.
type Events = {
  "document:deleted": [documentId: string];
};

class TypedEventEmitter extends EventEmitter {
  override emit<K extends keyof Events>(event: K, ...args: Events[K]): boolean {
    return super.emit(event, ...args);
  }
  override on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }
}

export const documentEvents = new TypedEventEmitter();
