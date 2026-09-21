import type { UserRow } from "../../../db/queries/users.js";
import { latestOutboxEmail } from "../email/mailer.js";
import { requestLoginCode, verifyLoginCode } from "../otp.service.js";

// The whole sign-in flow the way a person does it — ask for a code, read it
// from the (in-memory) inbox, type it in — for tests that just need a user to
// exist. Requires EMAIL_TRANSPORT=outbox (set in vitest.config.ts).
export async function readCodeFor(email: string): Promise<string> {
  const mail = latestOutboxEmail(email);
  const code = mail ? /\b(\d{6})\b/.exec(mail.text)?.[1] : undefined;
  if (!code) throw new Error(`no sign-in code in the outbox for ${email}`);
  return code;
}

export async function signInWithEmail(email: string): Promise<{ user: UserRow; isNewUser: boolean }> {
  await requestLoginCode(email);
  return verifyLoginCode(email, await readCodeFor(email));
}
