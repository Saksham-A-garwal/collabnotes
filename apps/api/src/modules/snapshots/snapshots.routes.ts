import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { validate } from "../../middleware/validate.js";
import { handleListSnapshots, handleRestoreSnapshot } from "./snapshots.controller.js";
import { documentIdParamSchema, restoreParamSchema } from "./snapshots.schema.js";

export const snapshotsRouter = Router({ mergeParams: true });

snapshotsRouter.get(
  "/",
  validate({ params: documentIdParamSchema }),
  asyncHandler(handleListSnapshots),
);
snapshotsRouter.post(
  "/:snapshotId/restore",
  validate({ params: restoreParamSchema }),
  asyncHandler(handleRestoreSnapshot),
);
