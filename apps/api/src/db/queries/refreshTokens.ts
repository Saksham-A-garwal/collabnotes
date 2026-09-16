import { pool } from "../pool.js";

export type RefreshTokenRow = {
  id: string;
  user_id: string;
  family_id: string;
  token_hash: string;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  revoked_reason: "rotated" | "logout" | "reuse_detected" | null;
};

export async function insertRefreshToken(params: {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [params.userId, params.familyId, params.tokenHash, params.expiresAt],
  );
}

export async function findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
  const result = await pool.query<RefreshTokenRow>(
    "SELECT * FROM refresh_tokens WHERE token_hash = $1",
    [tokenHash],
  );
  return result.rows[0] ?? null;
}

// Atomically marks the token revoked only if it's currently active — the
// same "conditional update as a lock" trick as the Cortex project's
// findOneAndUpdate({revoked:false}), just expressed as a Postgres UPDATE.
export async function revokeIfActive(
  tokenHash: string,
  reason: "rotated" | "logout",
): Promise<RefreshTokenRow | null> {
  const result = await pool.query<RefreshTokenRow>(
    `UPDATE refresh_tokens
     SET revoked_at = now(), revoked_reason = $2
     WHERE token_hash = $1 AND revoked_at IS NULL
     RETURNING *`,
    [tokenHash, reason],
  );
  return result.rows[0] ?? null;
}

export async function revokeFamily(familyId: string, reason: "reuse_detected"): Promise<number> {
  const result = await pool.query(
    `UPDATE refresh_tokens
     SET revoked_at = now(), revoked_reason = $2
     WHERE family_id = $1 AND revoked_at IS NULL`,
    [familyId, reason],
  );
  return result.rowCount ?? 0;
}
