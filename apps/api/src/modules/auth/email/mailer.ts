import crypto from "node:crypto";
import { env } from "../../../config/env.js";

export type Email = { to: string; subject: string; html: string; text: string };

export class EmailDeliveryError extends Error {}

// Everything the E2E suite needs to "read its inbox": the transport keeps the
// last few messages in memory. Only reachable when EMAIL_TRANSPORT=outbox,
// which env.ts refuses in production.
const outbox: Email[] = [];
const OUTBOX_LIMIT = 200;

export function latestOutboxEmail(to: string): Email | null {
  for (let i = outbox.length - 1; i >= 0; i--) {
    if (outbox[i]!.to === to) return outbox[i]!;
  }
  return null;
}

export function clearOutbox(): void {
  outbox.length = 0;
}

async function sendViaResend(mail: Email): Promise<void> {
  if (!env.RESEND_API_KEY) {
    throw new EmailDeliveryError("RESEND_API_KEY is not set");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      // Stops Gmail folding successive codes into one collapsed thread.
      headers: { "X-Entity-Ref-ID": crypto.randomUUID() },
    }),
    // A stuck provider must not hold the request (and the user) open.
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new EmailDeliveryError(`Resend responded ${res.status}: ${detail.slice(0, 300)}`);
  }
}

export async function sendEmail(mail: Email): Promise<void> {
  switch (env.EMAIL_TRANSPORT) {
    case "resend":
      await sendViaResend(mail);
      return;
    case "console":
      // Local development only — this prints the sign-in code.
      console.log(`\n--- email to ${mail.to} ---\nSubject: ${mail.subject}\n\n${mail.text}\n--- end email ---\n`);
      return;
    case "outbox":
      outbox.push(mail);
      if (outbox.length > OUTBOX_LIMIT) outbox.shift();
      return;
  }
}
