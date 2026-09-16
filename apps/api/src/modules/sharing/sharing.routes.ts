import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { authGuard } from "../../middleware/authGuard.js";
import { validate } from "../../middleware/validate.js";
import {
  handleCancelPendingInvite,
  handleCreateLink,
  handleInvite,
  handleListAccess,
  handleRedeemShareLink,
  handleRemoveAccess,
  handleRevokeLink,
} from "./sharing.controller.js";
import {
  accessParamSchema,
  createLinkSchema,
  documentIdParamSchema,
  inviteSchema,
  linkParamSchema,
  pendingInviteParamSchema,
  redeemParamSchema,
} from "./sharing.schema.js";

// Mounted under /api/v1/documents/:id — mergeParams so `:id` from the
// parent router is visible here. authGuard is applied by the parent
// documents router already (SRS §5.3).
export const sharingRouter = Router({ mergeParams: true });

sharingRouter.get(
  "/access",
  validate({ params: documentIdParamSchema }),
  asyncHandler(handleListAccess),
);
sharingRouter.post(
  "/share/invite",
  validate({ params: documentIdParamSchema, body: inviteSchema }),
  asyncHandler(handleInvite),
);
sharingRouter.post(
  "/share/link",
  validate({ params: documentIdParamSchema, body: createLinkSchema }),
  asyncHandler(handleCreateLink),
);
sharingRouter.delete(
  "/share/link/:token",
  validate({ params: linkParamSchema }),
  asyncHandler(handleRevokeLink),
);
sharingRouter.delete(
  "/access/:userId",
  validate({ params: accessParamSchema }),
  asyncHandler(handleRemoveAccess),
);
sharingRouter.delete(
  "/share/invite/:email",
  validate({ params: pendingInviteParamSchema }),
  asyncHandler(handleCancelPendingInvite),
);

// Not in SRS §5.3's list — token-keyed, so it can't be nested under
// /documents/:id (the client doesn't know the id from just a link).
// Mounted separately at the top level, still behind authGuard.
export const shareRedeemRouter = Router();
shareRedeemRouter.use(authGuard);
shareRedeemRouter.post(
  "/:token/redeem",
  validate({ params: redeemParamSchema }),
  asyncHandler(handleRedeemShareLink),
);
