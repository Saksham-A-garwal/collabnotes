import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { validate } from "../../middleware/validate.js";
import {
  handleCreateComment,
  handleDeleteComment,
  handleDeleteThread,
  handleEditComment,
  handleListComments,
  handleListPeople,
  handleReply,
  handleResolve,
} from "./comments.controller.js";
import {
  commentParamSchema,
  createThreadSchema,
  documentParamSchema,
  editCommentSchema,
  replySchema,
  resolveSchema,
  threadParamSchema,
} from "./comments.schema.js";

// Mounted under /api/v1/documents/:id/comments — mergeParams so `:id` from the
// parent router is visible. authGuard is applied by the parent documents router.
export const commentsRouter = Router({ mergeParams: true });

// Writing is chatty enough for a real conversation but not for a script: 60 a minute
// per person, across all documents.
const writeLimit = rateLimit({
  keyPrefix: "comment-write",
  windowSeconds: 60,
  max: 60,
  keyBy: (req) => req.userId ?? "anonymous",
  message: "You're commenting too fast.",
});

// People who can be @mentioned here. Registered before "/:threadId" routes so "people" is never read as an id.
commentsRouter.get("/people", validate({ params: documentParamSchema }), asyncHandler(handleListPeople));
commentsRouter.get("/", validate({ params: documentParamSchema }), asyncHandler(handleListComments));
commentsRouter.post("/", writeLimit, validate({ params: documentParamSchema, body: createThreadSchema }), asyncHandler(handleCreateComment));
commentsRouter.post("/:threadId/replies", writeLimit, validate({ params: threadParamSchema, body: replySchema }), asyncHandler(handleReply));
commentsRouter.patch("/:threadId", writeLimit, validate({ params: threadParamSchema, body: resolveSchema }), asyncHandler(handleResolve));
commentsRouter.delete("/:threadId", validate({ params: threadParamSchema }), asyncHandler(handleDeleteThread));
commentsRouter.patch(
  "/:threadId/comments/:commentId",
  writeLimit,
  validate({ params: commentParamSchema, body: editCommentSchema }),
  asyncHandler(handleEditComment),
);
commentsRouter.delete("/:threadId/comments/:commentId", validate({ params: commentParamSchema }), asyncHandler(handleDeleteComment));
