import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { authGuard } from "../../middleware/authGuard.js";
import { validate } from "../../middleware/validate.js";
import {
  handleCreateDocument,
  handleDeleteDocument,
  handleGetDocument,
  handleListDocuments,
  handleRenameDocument,
} from "./documents.controller.js";
import { createDocumentSchema, documentIdParamSchema, renameDocumentSchema } from "./documents.schema.js";
import { snapshotsRouter } from "../snapshots/snapshots.routes.js";
import { sharingRouter } from "../sharing/sharing.routes.js";

export const documentsRouter = Router();

// BR-2: role/access is checked server-side on every REST call — authGuard
// establishes identity, requireAccess (documents.service.ts) checks role.
documentsRouter.use(authGuard);

documentsRouter.get("/", asyncHandler(handleListDocuments));
documentsRouter.post("/", validate({ body: createDocumentSchema }), asyncHandler(handleCreateDocument));
documentsRouter.get(
  "/:id",
  validate({ params: documentIdParamSchema }),
  asyncHandler(handleGetDocument),
);
documentsRouter.patch(
  "/:id",
  validate({ params: documentIdParamSchema, body: renameDocumentSchema }),
  asyncHandler(handleRenameDocument),
);
documentsRouter.delete(
  "/:id",
  validate({ params: documentIdParamSchema }),
  asyncHandler(handleDeleteDocument),
);

documentsRouter.use("/:id/snapshots", snapshotsRouter);
documentsRouter.use("/:id", sharingRouter);
