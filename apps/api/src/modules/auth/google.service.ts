import { OAuth2Client } from "google-auth-library";
import { ApiError } from "@collabnotes/shared";
import { env } from "../../config/env.js";

// Cortex's passport-google-oauth20 strategy drives a server-initiated
// redirect (GET /google -> Google -> GET /google/callback) with a session.
// SRS FR-2/§5.1 instead has the SPA run the redirect itself and POST the
// resulting `code` to the API, so the exchange happens here via
// google-auth-library rather than passport middleware.
const client = new OAuth2Client({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  redirectUri: env.GOOGLE_REDIRECT_URI,
});

export type GoogleProfile = {
  email: string;
  displayName: string;
  avatarUrl: string | null;
  googleUid: string;
};

export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new ApiError("INTERNAL_ERROR", "Google sign-in is not configured.");
  }

  let idToken: string | null | undefined;
  try {
    const { tokens } = await client.getToken(code);
    idToken = tokens.id_token;
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Invalid or expired Google authorization code.");
  }

  if (!idToken) {
    throw new ApiError("VALIDATION_ERROR", "Google did not return an identity token.");
  }

  const ticket = await client.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.email) {
    throw new ApiError("VALIDATION_ERROR", "Google account has no verified email.");
  }

  // Accounts are matched by email, so an unverified address here would let
  // someone claim an email they don't own and take over the account behind it.
  if (payload.email_verified !== true) {
    throw new ApiError("VALIDATION_ERROR", "Your Google account's email address isn't verified.");
  }

  return {
    email: payload.email,
    displayName: payload.name ?? payload.email.split("@")[0] ?? "Google User",
    avatarUrl: payload.picture ?? null,
    googleUid: payload.sub,
  };
}
