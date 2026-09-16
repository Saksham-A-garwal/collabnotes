import bcrypt from "bcrypt";
import { ApiError } from "@collabnotes/shared";
import { resolvePendingInvites } from "../../db/queries/sharing.js";
import {
  createUserWithOAuth,
  createUserWithPassword,
  findUserByEmail,
  findUserByOAuth,
  linkOAuthToUser,
  type UserRow,
} from "../../db/queries/users.js";

const BCRYPT_COST = 12; // SRS FR-3: cost factor >= 12

export async function registerWithPassword(params: {
  email: string;
  password: string;
  displayName: string;
}): Promise<UserRow> {
  const existing = await findUserByEmail(params.email);
  if (existing) {
    throw new ApiError("EMAIL_ALREADY_EXISTS", "An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(params.password, BCRYPT_COST);
  const user = await createUserWithPassword({
    email: params.email,
    passwordHash,
    displayName: params.displayName,
  });
  // FR-19: any invite sent to this email before an account existed becomes
  // real access now.
  await resolvePendingInvites(params.email, user.id);
  return user;
}

export async function loginWithPassword(params: {
  email: string;
  password: string;
}): Promise<UserRow> {
  const user = await findUserByEmail(params.email);
  if (!user || !user.password_hash) {
    throw new ApiError("INVALID_CREDENTIALS", "Incorrect email or password.");
  }

  const matches = await bcrypt.compare(params.password, user.password_hash);
  if (!matches) {
    throw new ApiError("INVALID_CREDENTIALS", "Incorrect email or password.");
  }

  return user;
}

// Ported from the Cortex project's passport.js Google strategy verify
// callback: match by provider+uid first, fall back to matching by email
// (linking the OAuth identity to an existing password account), else
// create a new account (SRS FR-2: "matched by email if existing").
export async function findOrCreateGoogleUser(profile: {
  email: string;
  displayName: string;
  avatarUrl: string | null;
  googleUid: string;
}): Promise<UserRow> {
  const byOAuth = await findUserByOAuth("google", profile.googleUid);
  if (byOAuth) return byOAuth;

  const byEmail = await findUserByEmail(profile.email);
  if (byEmail) {
    if (!byEmail.oauth_provider) {
      await linkOAuthToUser(byEmail.id, "google", profile.googleUid);
    }
    return byEmail;
  }

  const user = await createUserWithOAuth({
    email: profile.email,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    oauthProvider: "google",
    oauthUid: profile.googleUid,
  });
  await resolvePendingInvites(profile.email, user.id);
  return user;
}
