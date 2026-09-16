import { env } from "../config/env.js";
import type { RoomManager } from "./roomManager.js";

// FR-23(a): on a fixed interval, snapshot every document with changes
// since its last snapshot (Architecture §6.2). Only documents currently
// active in memory can be dirty, so this never touches Postgres for
// documents nobody has open.
export function startSnapshotJob(roomManager: RoomManager): NodeJS.Timeout {
  const timer = setInterval(() => {
    for (const documentId of roomManager.getDirtyRoomIds()) {
      roomManager.snapshotIfDirty(documentId).catch((err: unknown) => {
        console.error(
          JSON.stringify({
            level: "error",
            message: "snapshot job failed",
            documentId,
            error: (err as Error).message,
          }),
        );
      });
    }
  }, env.SNAPSHOT_INTERVAL_MS);

  timer.unref(); // don't keep the process (or a test run) alive just for this
  return timer;
}
