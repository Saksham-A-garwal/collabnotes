import type { InviteNotification, Role } from "@collabnotes/shared";
import { env } from "../../config/env.js";
import { sendEmail } from "../auth/email/mailer.js";
import { claimCooldown, takeDailySlot, withinWindow } from "../auth/email/quota.js";
import { renderInviteEmail } from "../auth/email/templates.js";

// "Notify by email" lets any signed-in owner make CollabNotes email an address
// of their choosing — which is exactly the shape of an email-spam / phishing
// relay. So it is fenced in four independent ways, all checked *before* anything
// is sent, and none of them can ever stop the share itself from succeeding:
//
//  1. per (document, recipient) cooldown: flipping a role back and forth, or
//     re-submitting the form, doesn't send a second email
//  2. per owner: one person can't fan out to a list of addresses
//  3. per recipient per day: no address gets buried, however many owners try
//  4. the shared daily budget, which stops short of the last slots so an
//     invitation can never leave someone unable to log in
export const RESEND_INVITE_COOLDOWN_SECONDS = 10 * 60;
export const OWNER_INVITE_EMAILS_PER_HOUR = 20;
export const RECIPIENT_INVITE_EMAILS_PER_DAY = 5;

const frontendOrigin = (): string => env.CORS_ORIGIN.split(",")[0]!.trim();

export async function notifyInvitee(params: {
  documentId: string;
  documentTitle: string;
  ownerId: string;
  inviterName: string;
  email: string;
  role: Exclude<Role, "owner">;
  recipientHasAccount: boolean;
}): Promise<Extract<InviteNotification, "sent" | "limited" | "failed">> {
  const { documentId, ownerId, email } = params;

  if (!(await claimCooldown(`invite-email:cool:${documentId}:${email}`, RESEND_INVITE_COOLDOWN_SECONDS))) return "limited";
  if (!(await withinWindow(`invite-email:owner:${ownerId}`, 60 * 60, OWNER_INVITE_EMAILS_PER_HOUR))) return "limited";
  if (!(await withinWindow(`invite-email:to:${email}`, 24 * 60 * 60, RECIPIENT_INVITE_EMAILS_PER_DAY))) return "limited";
  if (!(await takeDailySlot("invite"))) return "limited";

  const appUrl = frontendOrigin();
  try {
    await sendEmail({
      to: email,
      ...renderInviteEmail({
        inviterName: params.inviterName,
        documentTitle: params.documentTitle,
        role: params.role,
        recipientEmail: email,
        recipientHasAccount: params.recipientHasAccount,
        // A plain link into the app: no token. Opening it while signed out goes
        // through sign-in and lands back on the document.
        documentUrl: `${appUrl}/documents/${documentId}`,
        appUrl,
        sentAt: new Date(),
      }),
    });
    return "sent";
  } catch (err) {
    console.error(
      JSON.stringify({ level: "error", message: "invitation email failed to send", transport: env.EMAIL_TRANSPORT, documentId, error: (err as Error).message }),
    );
    return "failed";
  }
}
