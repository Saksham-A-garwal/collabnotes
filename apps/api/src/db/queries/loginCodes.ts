import { pool } from "../pool.js";

export type LoginCodeRow = {
  id: string;
  email: string;
  code_hash: string;
  attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
};

export async function insertLoginCode(params: {
  email: string;
  codeHash: string;
  expiresAt: Date;
}): Promise<string> {
  const result = await pool.query<{ id: string }>(
    "INSERT INTO login_codes (email, code_hash, expires_at) VALUES ($1, $2, $3) RETURNING id",
    [params.email, params.codeHash, params.expiresAt],
  );
  return result.rows[0]!.id;
}

export async function supersedeOtherCodes(email: string, keepId: string): Promise<void> {
  await pool.query(
    "UPDATE login_codes SET consumed_at = now() WHERE email = $1 AND id <> $2 AND consumed_at IS NULL",
    [email, keepId],
  );
}

export async function deleteLoginCode(id: string): Promise<void> {
  await pool.query("DELETE FROM login_codes WHERE id = $1", [id]);
}

export async function latestCodeCreatedAt(email: string): Promise<Date | null> {
  const result = await pool.query<{ created_at: Date }>(
    "SELECT created_at FROM login_codes WHERE email = $1 ORDER BY created_at DESC LIMIT 1",
    [email],
  );
  return result.rows[0]?.created_at ?? null;
}

export async function reserveAttempt(
  email: string,
  maxAttempts: number,
): Promise<Pick<LoginCodeRow, "id" | "code_hash" | "attempts"> | null> {
  const result = await pool.query<Pick<LoginCodeRow, "id" | "code_hash" | "attempts">>(
    `UPDATE login_codes SET attempts = attempts + 1
     WHERE id = (
       SELECT id FROM login_codes
       WHERE email = $1 AND consumed_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1
     )
     AND consumed_at IS NULL AND attempts < $2
     RETURNING id, code_hash, attempts`,
    [email, maxAttempts],
  );
  return result.rows[0] ?? null;
}

export async function consumeCode(id: string): Promise<boolean> {
  const result = await pool.query(
    "UPDATE login_codes SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL AND expires_at > now()",
    [id],
  );
  return result.rowCount === 1;
}

export async function invalidateCode(id: string): Promise<void> {
  await pool.query("UPDATE login_codes SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL", [id]);
}

export async function deleteStaleCodes(): Promise<void> {
  await pool.query("DELETE FROM login_codes WHERE expires_at < now() - interval '1 day'");
}
