import type { UserRow } from "../../../db/queries/users.js";
import { latestOutboxEmail } from "../email/mailer.js";
import { requestLoginCode, verifyLoginCode } from "../otp.service.js";

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
