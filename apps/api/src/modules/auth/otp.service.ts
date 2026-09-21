import crypto from "node:crypto";
import { ApiError, type RequestCodeResponse } from "@collabnotes/shared";
import { env } from "../../config/env.js";
import { resolvePendingInvites } from "../../db/queries/sharing.js";
import {
  consumeCode,
  deleteLoginCode,
  deleteStaleCodes,
  insertLoginCode,
  invalidateCode,
  latestCodeCreatedAt,
  reserveAttempt,
  supersedeOtherCodes,
} from "../../db/queries/loginCodes.js";
import { findOrCreateUserByEmail, type UserRow } from "../../db/queries/users.js";
import { sendEmail } from "./email/mailer.js";
import { takeDailySlot } from "./email/quota.js";
import { renderSignInCodeEmail } from "./email/templates.js";

export const CODE_TTL_SECONDS = 10 * 60;
export const MAX_ATTEMPTS = 5; // wrong guesses allowed per code

// The code is only ever stored as an HMAC keyed off a server secret and bound
// to the address, so a database leak doesn't hand out live codes and a hash
// from one address can't be replayed against another. (It can't stop offline
// brute force of a 6-digit space by someone holding both the database *and* the
// secret — that's what the short expiry and attempt cap are for.)
function hmacKey(): Buffer {
  return crypto.createHash("sha256").update(`collabnotes:login-code:${env.JWT_SECRET}`).digest();
}

export function hashCode(email: string, code: string): string {
  return crypto.createHmac("sha256", hmacKey()).update(`${email}:${code}`).digest("hex");
}

const generateCode = (): string => crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");

function equalHashes(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// "saksham.agarwal+news@x.com" -> "Saksham Agarwal". Just a starting point;
// new accounts are asked for their real name straight after signing in.
export function nameFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "").split("+")[0] ?? "";
  const words = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.join(" ").slice(0, 80) || "New user";
}

const frontendOrigin = (): string => env.CORS_ORIGIN.split(",")[0]!.trim();

// Same work and same response whether or not an account exists for `email`, so
// this endpoint can't be used to find out who has an account.
export async function requestLoginCode(email: string): Promise<RequestCodeResponse> {
  const cooldown = env.OTP_RESEND_COOLDOWN_SECONDS;
  if (cooldown > 0) {
    const last = await latestCodeCreatedAt(email);
    if (last) {
      const waitMs = cooldown * 1000 - (Date.now() - last.getTime());
      if (waitMs > 0) {
        const seconds = Math.ceil(waitMs / 1000);
        throw new ApiError("RATE_LIMITED", `Please wait ${seconds} seconds before requesting another code.`);
      }
    }
  }

  if (!(await takeDailySlot("signin"))) {
    console.error(JSON.stringify({ level: "error", message: "daily email limit reached", limit: env.EMAIL_DAILY_LIMIT }));
    throw new ApiError(
      "SERVICE_UNAVAILABLE",
      "We're sending a lot of emails right now. Please try again later, or continue with Google.",
    );
  }

  const code = generateCode();
  const codeId = await insertLoginCode({
    email,
    codeHash: hashCode(email, code),
    expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000),
  });

  const message = renderSignInCodeEmail({
    code,
    email,
    expiresInMinutes: CODE_TTL_SECONDS / 60,
    appUrl: frontendOrigin(),
    requestedAt: new Date(),
  });

  try {
    await sendEmail({ to: email, ...message });
  } catch (err) {
    // The person never got this code, so it must not exist. Older codes are
    // untouched — they were not superseded yet, so an earlier email still works.
    await deleteLoginCode(codeId).catch(() => undefined);
    console.error(
      JSON.stringify({ level: "error", message: "sign-in email failed to send", transport: env.EMAIL_TRANSPORT, error: (err as Error).message }),
    );
    throw new ApiError("SERVICE_UNAVAILABLE", "We couldn't send the email right now. Please try again in a moment.");
  }

  // Only now that the new email is out do the older codes stop working.
  await supersedeOtherCodes(email, codeId);
  deleteStaleCodes().catch(() => undefined);

  return { resendAfterSeconds: cooldown, expiresInSeconds: CODE_TTL_SECONDS };
}

const INVALID = (message = "That code is incorrect or has expired."): ApiError => new ApiError("INVALID_CODE", message);

export async function verifyLoginCode(
  email: string,
  code: string,
): Promise<{ user: UserRow; isNewUser: boolean }> {
  // Spend a guess first (see reserveAttempt), then compare.
  const reserved = await reserveAttempt(email, MAX_ATTEMPTS);
  if (!reserved) throw INVALID();

  if (!equalHashes(hashCode(email, code), reserved.code_hash)) {
    if (reserved.attempts >= MAX_ATTEMPTS) {
      await invalidateCode(reserved.id);
      throw INVALID("Too many incorrect attempts. Request a new code.");
    }
    throw INVALID();
  }

  // Correct — but only one request may cash it in.
  if (!(await consumeCode(reserved.id))) throw INVALID();

  const { user, isNew } = await findOrCreateUserByEmail({ email, displayName: nameFromEmail(email) });
  // FR-19: an invite sent to this address before it had an account becomes real access now.
  if (isNew) await resolvePendingInvites(email, user.id);
  return { user, isNewUser: isNew };
}
