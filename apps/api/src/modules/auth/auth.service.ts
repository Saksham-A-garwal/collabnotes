import { resolvePendingInvites } from "../../db/queries/sharing.js";
import {
  createUserWithOAuth,
  findUserByEmail,
  findUserByOAuth,
  linkOAuthToUser,
  type UserRow,
} from "../../db/queries/users.js";

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
