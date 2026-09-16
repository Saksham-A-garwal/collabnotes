// WebSocket sync protocol envelope bytes. Source of truth: SRS §5.5.

export const WS_MESSAGE = {
  SYNC_STEP_1: 0x00, // state vector
  SYNC_STEP_2: 0x01, // update (initial)
  UPDATE: 0x02, // incremental update
  AWARENESS: 0x03, // presence/cursor
} as const;

export type WsMessageType = (typeof WS_MESSAGE)[keyof typeof WS_MESSAGE];
