import type { Request, Response } from "express";
import { ApiError, type AuthResponse, type VerifyCodeResponse } from "@collabnotes/shared";
import { toUserPublic, updateDisplayName, type UserRow } from "../../db/queries/users.js";
import { findOrCreateGoogleUser } from "./auth.service.js";
import { exchangeGoogleCode } from "./google.service.js";
import { requestLoginCode, verifyLoginCode } from "./otp.service.js";
import { issueAccessToken, issueTokenPair, revokeRefreshToken, rotateRefreshToken } from "./token.service.js";

async function respondWithTokenPair(res: Response, status: number, user: UserRow): Promise<void> {
  const pair = await issueTokenPair(user.id);
  const body: AuthResponse = { user: toUserPublic(user), ...pair };
  res.status(status).json(body);
}

// Same answer whether or not the address has an account (see requestLoginCode).
export async function handleRequestCode(req: Request, res: Response): Promise<void> {
  res.status(200).json(await requestLoginCode(req.body.email));
}

export async function handleVerifyCode(req: Request, res: Response): Promise<void> {
  const { user, isNewUser } = await verifyLoginCode(req.body.email, req.body.code);
  const pair = await issueTokenPair(user.id);
  const body: VerifyCodeResponse = { user: toUserPublic(user), ...pair, isNewUser };
  res.status(200).json(body);
}

export async function handleUpdateMe(req: Request, res: Response): Promise<void> {
  const user = await updateDisplayName(req.userId!, req.body.displayName);
  if (!user) throw new ApiError("UNAUTHENTICATED", "Please sign in again.");
  res.status(200).json({ user: toUserPublic(user) });
}

export async function handleGoogleOAuth(req: Request, res: Response): Promise<void> {
  const profile = await exchangeGoogleCode(req.body.code);
  const user = await findOrCreateGoogleUser(profile);
  await respondWithTokenPair(res, 200, user);
}

// Ported from the Cortex project's handleRefresh: same three-way branch on
// rotation result (ok / reuse detected / anything else invalid), adapted to
// the SRS's JSON-body refresh contract (no cookie) and its single
// REFRESH_TOKEN_INVALID_OR_REUSED error code covering both invalid and
// reused tokens (§5.1, §8) rather than Cortex's two distinct codes.
export async function handleRefresh(req: Request, res: Response): Promise<void> {
  const result = await rotateRefreshToken(req.body.refreshToken);

  if (result.status === "ok") {
    res.status(200).json({
      accessToken: issueAccessToken(result.userId),
      refreshToken: result.refreshToken,
    });
    return;
  }

  if (result.status === "reuse_detected") {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "refresh token reuse detected",
        userId: result.userId,
        revokedCount: result.revokedCount,
      }),
    );
  }

  if (result.status === "race") {
    res.status(409).json({ error: { code: "VALIDATION_ERROR", message: "Please retry." } });
    return;
  }

  res.status(401).json({
    error: {
      code: "REFRESH_TOKEN_INVALID_OR_REUSED",
      message: "Session invalid or reused. Please sign in again.",
    },
  });
}

export async function handleLogout(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body ?? {};
  if (typeof refreshToken === "string") await revokeRefreshToken(refreshToken);
  res.status(204).send();
}
