import { z } from "zod";

export const MAX_UPDATE_BYTES = 1_000_000;
export const MAX_AWARENESS_BYTES = 64_000;
export const MAX_JOINED_DOCUMENTS = 20;

const uuid = z.string().uuid();

export function parseDocumentId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const parsed = uuid.safeParse((payload as { documentId?: unknown }).documentId);
  return parsed.success ? parsed.data : null;
}

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
