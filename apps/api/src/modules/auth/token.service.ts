import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import {
  findRefreshTokenByHash,
  insertRefreshToken,
  revokeFamily,
  revokeIfActive,
} from "../../db/queries/refreshTokens.js";

const RACE_GRACE_MS = 10_000;

export const hashToken = (raw: string): string =>
  crypto.createHash("sha256").update(raw).digest("hex");

export function issueAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
  } as jwt.SignOptions);
}

async function issueRefreshToken(userId: string, familyId: string): Promise<string> {
  const raw = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await insertRefreshToken({ userId, familyId, tokenHash: hashToken(raw), expiresAt });
  return raw;
}

export async function issueTokenPair(
  userId: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const familyId = crypto.randomUUID();
  const refreshToken = await issueRefreshToken(userId, familyId);
  return { accessToken: issueAccessToken(userId), refreshToken };
}

export type RotateResult =
  | { status: "ok"; userId: string; refreshToken: string }
  | { status: "race"; userId: string }
  | { status: "reuse_detected"; userId: string; revokedCount: number }
  | { status: "invalid" };

export async function rotateRefreshToken(rawToken: string): Promise<RotateResult> {
  const tokenHash = hashToken(rawToken);

  const current = await revokeIfActive(tokenHash, "rotated");
  if (current) {
    if (current.expires_at.getTime() < Date.now()) {
      return { status: "invalid" };
    }
    const refreshToken = await issueRefreshToken(current.user_id, current.family_id);
    return { status: "ok", userId: current.user_id, refreshToken };
  }

  const existing = await findRefreshTokenByHash(tokenHash);
  if (!existing) return { status: "invalid" };

  if (existing.revoked_reason === "reuse_detected" || existing.revoked_reason === "logout") {
    return { status: "invalid" };
  }

  if (existing.revoked_reason === "rotated" && existing.revoked_at) {
    const rotatedAgo = Date.now() - existing.revoked_at.getTime();
    if (rotatedAgo <= RACE_GRACE_MS) {
      return { status: "race", userId: existing.user_id };
    }
  }

  const revokedCount = await revokeFamily(existing.family_id, "reuse_detected");
  return { status: "reuse_detected", userId: existing.user_id, revokedCount };
}

export async function revokeRefreshToken(rawToken: string): Promise<boolean> {
  const result = await revokeIfActive(hashToken(rawToken), "logout");
  return result !== null;
}
