import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { authGuard } from "../../middleware/authGuard.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { validate } from "../../middleware/validate.js";
import {
  handleCreateDocument,
  handleDeleteDocument,
  handleGetDocument,
  handleListDocuments,
  handleRenameDocument,
  handleSearchDocuments,
} from "./documents.controller.js";
import { createDocumentSchema, documentIdParamSchema, renameDocumentSchema, searchQuerySchema } from "./documents.schema.js";
import { commentsRouter } from "../comments/comments.routes.js";
import { snapshotsRouter } from "../snapshots/snapshots.routes.js";
import { sharingRouter } from "../sharing/sharing.routes.js";

export const documentsRouter = Router();

// BR-2: role/access is checked server-side on every REST call — authGuard
// establishes identity, requireAccess (documents.service.ts) checks role.
documentsRouter.use(authGuard);

documentsRouter.get("/", asyncHandler(handleListDocuments));
documentsRouter.post("/", validate({ body: createDocumentSchema }), asyncHandler(handleCreateDocument));
// Registered before "/:id", which would otherwise claim "search" as a document id.
// Per-user limit: search-as-you-type is chatty, but a script can't hammer the database.
documentsRouter.get(
  "/search",
  rateLimit({ keyPrefix: "search-user", windowSeconds: 60, max: 120, keyBy: (req) => req.userId ?? "anonymous", message: "You're searching too fast." }),
  validate({ query: searchQuerySchema }),
  asyncHandler(handleSearchDocuments),
);
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
documentsRouter.use("/:id/comments", commentsRouter);
documentsRouter.use("/:id", sharingRouter);
