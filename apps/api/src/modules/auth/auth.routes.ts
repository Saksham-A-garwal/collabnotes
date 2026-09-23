import { Router } from "express";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { authGuard } from "../../middleware/authGuard.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { validate } from "../../middleware/validate.js";
import {
  handleGoogleOAuth,
  handleLogout,
  handleRefresh,
  handleRequestCode,
  handleUpdateMe,
  handleVerifyCode,
} from "./auth.controller.js";
import {
  oauthGoogleSchema,
  refreshSchema,
  requestCodeSchema,
  updateMeSchema,
  verifyCodeSchema,
} from "./auth.schema.js";

export const authRouter = Router();

authRouter.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

const MINUTE = 60;
const byEmail = (req: { body?: { email?: string } }): string => req.body?.email ?? "unknown";

authRouter.post(
  "/email/request",
  rateLimit({ keyPrefix: "code-ip", windowSeconds: 15 * MINUTE, max: env.AUTH_RATE_LIMIT_MAX, message: "Too many sign-in attempts from this address." }),
  validate({ body: requestCodeSchema }),
  rateLimit({ keyPrefix: "code-email", windowSeconds: 10 * MINUTE, max: 3, keyBy: byEmail, message: "Too many codes requested for this email." }),
  asyncHandler(handleRequestCode),
);

authRouter.post(
  "/email/verify",
  rateLimit({ keyPrefix: "verify-ip", windowSeconds: 15 * MINUTE, max: env.AUTH_RATE_LIMIT_MAX * 3, message: "Too many attempts from this address." }),
  validate({ body: verifyCodeSchema }),
  rateLimit({ keyPrefix: "verify-email", windowSeconds: 15 * MINUTE, max: 20, keyBy: byEmail, message: "Too many attempts for this email." }),
  asyncHandler(handleVerifyCode),
);

authRouter.post(
  "/oauth/google",
  rateLimit({ keyPrefix: "oauth-ip", windowSeconds: 15 * MINUTE, max: env.AUTH_RATE_LIMIT_MAX, message: "Too many sign-in attempts from this address." }),
  validate({ body: oauthGoogleSchema }),
  asyncHandler(handleGoogleOAuth),
);

authRouter.post(
  "/refresh",
  rateLimit({ keyPrefix: "refresh-ip", windowSeconds: 15 * MINUTE, max: 300, message: "Too many session refreshes from this address." }),
  validate({ body: refreshSchema }),
  asyncHandler(handleRefresh),
);

authRouter.post("/logout", authGuard, asyncHandler(handleLogout));
authRouter.patch("/me", authGuard, validate({ body: updateMeSchema }), asyncHandler(handleUpdateMe));
