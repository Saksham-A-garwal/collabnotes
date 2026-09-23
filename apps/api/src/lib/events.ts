import { EventEmitter } from "node:events";

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
