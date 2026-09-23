import { env } from "../config/env.js";
import type { RoomManager } from "./roomManager.js";

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

  timer.unref();
  return timer;
}
