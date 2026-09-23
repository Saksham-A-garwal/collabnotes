import type { InviteNotification, Role } from "@collabnotes/shared";
import { env } from "../../config/env.js";
import { sendEmail } from "../auth/email/mailer.js";
import { claimCooldown, takeDailySlot, withinWindow } from "../auth/email/quota.js";
import { renderInviteEmail } from "../auth/email/templates.js";

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
