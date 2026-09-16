import type { UserPublic } from "@collabnotes/shared";
import { pool } from "../pool.js";

export type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  display_name: string;
  avatar_url: string | null;
  oauth_provider: string | null;
  oauth_uid: string | null;
  created_at: Date;
};

export function toUserPublic(row: UserRow): UserPublic {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  };
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>("SELECT * FROM users WHERE email = $1", [email]);
  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function findUserByOAuth(
  provider: string,
  uid: string,
): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    "SELECT * FROM users WHERE oauth_provider = $1 AND oauth_uid = $2",
    [provider, uid],
  );
  return result.rows[0] ?? null;
}

export async function createUserWithPassword(params: {
  email: string;
  passwordHash: string;
  displayName: string;
}): Promise<UserRow> {
  const result = await pool.query<UserRow>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3) RETURNING *`,
    [params.email, params.passwordHash, params.displayName],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to create user");
  return row;
}

export async function createUserWithOAuth(params: {
  email: string;
  displayName: string;
  avatarUrl: string | null;
  oauthProvider: string;
  oauthUid: string;
}): Promise<UserRow> {
  const result = await pool.query<UserRow>(
    `INSERT INTO users (email, display_name, avatar_url, oauth_provider, oauth_uid)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [params.email, params.displayName, params.avatarUrl, params.oauthProvider, params.oauthUid],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to create user");
  return row;
}

export async function linkOAuthToUser(
  userId: string,
  provider: string,
  uid: string,
): Promise<void> {
  await pool.query(
    "UPDATE users SET oauth_provider = $2, oauth_uid = $3 WHERE id = $1",
    [userId, provider, uid],
  );
}
