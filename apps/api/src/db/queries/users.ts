import type { UserPublic } from "@collabnotes/shared";
import { pool } from "../pool.js";

export type UserRow = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  email_mentions: boolean;
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
    emailMentions: row.email_mentions,
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

export async function findOrCreateUserByEmail(params: {
  email: string;
  displayName: string;
}): Promise<{ user: UserRow; isNew: boolean }> {
  const result = await pool.query<UserRow & { is_new: boolean }>(
    `INSERT INTO users (email, display_name)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET email = users.email
     RETURNING *, (xmax = 0) AS is_new`,
    [params.email, params.displayName],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to find or create user");
  const { is_new: isNew, ...user } = row;
  return { user, isNew };
}

export async function updateDisplayName(userId: string, displayName: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    "UPDATE users SET display_name = $2 WHERE id = $1 RETURNING *",
    [userId, displayName],
  );
  return result.rows[0] ?? null;
}

export async function updateEmailMentions(userId: string, emailMentions: boolean): Promise<UserRow | null> {
  const result = await pool.query<UserRow>("UPDATE users SET email_mentions = $2 WHERE id = $1 RETURNING *", [userId, emailMentions]);
  return result.rows[0] ?? null;
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
