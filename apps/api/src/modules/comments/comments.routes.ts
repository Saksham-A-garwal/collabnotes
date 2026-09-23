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

export const commentsRouter = Router({ mergeParams: true });

const writeLimit = rateLimit({
  keyPrefix: "comment-write",
  windowSeconds: 60,
  max: 60,
  keyBy: (req) => req.userId ?? "anonymous",
  message: "You're commenting too fast.",
});

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
