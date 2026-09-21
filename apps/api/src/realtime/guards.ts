import { z } from "zod";

// Everything a socket client sends is attacker-controlled: socket.io hands the
// server whatever the client emitted, with no schema. These helpers are the
// single place that decides whether a payload is even shaped correctly, before
// any of it reaches Yjs, the database, or an allocator.

// One Yjs update is normally a few hundred bytes. A paste of a large document
// is the realistic worst case; socket.io's own maxHttpBufferSize (set to the
// same figure in index.ts) drops anything bigger before it gets here.
export const MAX_UPDATE_BYTES = 1_000_000;
export const MAX_AWARENESS_BYTES = 64_000;
// A person has a handful of documents open. Each join hydrates a document into
// server memory, so an unbounded loop of joins is a memory-exhaustion lever.
export const MAX_JOINED_DOCUMENTS = 20;

const uuid = z.string().uuid();

export function parseDocumentId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const parsed = uuid.safeParse((payload as { documentId?: unknown }).documentId);
  return parsed.success ? parsed.data : null;
}

// Accepts the binary shapes socket.io delivers (Buffer / typed array /
// ArrayBuffer) and *nothing else*. In particular a number is refused:
// `new Uint8Array(2_000_000_000)` would happily try to allocate 2 GB.
export function parseBinary(payload: unknown, maxBytes: number): Uint8Array | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = (payload as { update?: unknown; stateVector?: unknown }).update ?? (payload as { stateVector?: unknown }).stateVector;

  let bytes: Uint8Array;
  if (value instanceof ArrayBuffer) {
    bytes = new Uint8Array(value);
  } else if (ArrayBuffer.isView(value)) {
    bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  } else {
    return null;
  }
  return bytes.byteLength <= maxBytes ? bytes : null;
}

// Classic token bucket. Sized so real typing never touches it (a fast typist
// makes ~15 updates a second) but a script blasting thousands does.
export class TokenBucket {
  private tokens: number;
  private last = Date.now();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = capacity;
  }

  take(cost = 1): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.refillPerSecond);
    this.last = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}
