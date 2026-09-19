import { Router } from "express";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { authGuard } from "../../middleware/authGuard.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { validate } from "../../middleware/validate.js";
import {
  handleGoogleOAuth,
  handleLogin,
  handleLogout,
  handleRefresh,
  handleRegister,
} from "./auth.controller.js";
import { loginSchema, oauthGoogleSchema, refreshSchema, registerSchema } from "./auth.schema.js";

// Router-wide per-IP limiter, ported from the Cortex project's auth.routes.js
// (15 min window, 10 requests) — SRS §9.2 A07 asks for rate-limited auth
// endpoints without prescribing numbers, so the Cortex defaults carry over.
export const authRouter = Router();

authRouter.use(
  rateLimit({
    keyPrefix: "auth-ip",
    windowSeconds: 15 * 60,
    max: env.AUTH_RATE_LIMIT_MAX,
    message: "Too many sign-in attempts from this address.",
  }),
);

authRouter.post("/register", validate({ body: registerSchema }), asyncHandler(handleRegister));
authRouter.post("/login", validate({ body: loginSchema }), asyncHandler(handleLogin));
authRouter.post(
  "/oauth/google",
  validate({ body: oauthGoogleSchema }),
  asyncHandler(handleGoogleOAuth),
);
authRouter.post("/refresh", validate({ body: refreshSchema }), asyncHandler(handleRefresh));
authRouter.post("/logout", authGuard, asyncHandler(handleLogout));
