import { env } from "../../config/env.js";
import { createMentionNotifications, getRecipients } from "../../db/queries/comments.js";
import { getRoomManager } from "../../realtime/index.js";
import { sendEmail } from "../auth/email/mailer.js";
import { claimCooldown, takeDailySlot, withinWindow } from "../auth/email/quota.js";
import { renderMentionEmail } from "../auth/email/templates.js";

export const MENTION_COOLDOWN_SECONDS = 10 * 60;
export const AUTHOR_MENTION_EMAILS_PER_HOUR = 20;
export const RECIPIENT_MENTION_EMAILS_PER_HOUR = 10;

const frontendOrigin = (): string => env.CORS_ORIGIN.split(",")[0]!.trim();

export async function notifyMentions(params: {
  documentId: string;
  documentTitle: string;
  threadId: string;
  commentId: string;
  author: { id: string; name: string };
  quote: string;
  body: string;
  userIds: string[];
}): Promise<{ emailed: number }> {
  const { documentId, threadId, author, userIds } = params;
  if (userIds.length === 0) return { emailed: 0 };

  try {
    await createMentionNotifications({ userIds, documentId, threadId, commentId: params.commentId, actorId: author.id });
    try {
      await getRoomManager().notifyUsers(userIds);
    } catch {
    }
  } catch (err) {
    console.error(JSON.stringify({ level: "error", message: "mention notification failed", documentId, error: (err as Error).message }));
  }

  let emailed = 0;
  const appUrl = frontendOrigin();
  for (const person of await getRecipients(userIds)) {
    try {
      if (!person.email_mentions) continue;
      let present = false;
      try {
        present = getRoomManager().isUserPresent(documentId, person.id);
      } catch {
      }
      if (present) continue;

      if (!(await claimCooldown(`mention-email:cool:${threadId}:${person.id}`, MENTION_COOLDOWN_SECONDS))) continue;
      if (!(await withinWindow(`mention-email:author:${author.id}`, 60 * 60, AUTHOR_MENTION_EMAILS_PER_HOUR))) continue;
      if (!(await withinWindow(`mention-email:to:${person.id}`, 60 * 60, RECIPIENT_MENTION_EMAILS_PER_HOUR))) continue;
      if (!(await takeDailySlot("mention"))) continue;

      await sendEmail({
        to: person.email,
        ...renderMentionEmail({
          authorName: author.name,
          documentTitle: params.documentTitle,
          quote: params.quote,
          body: params.body,
          threadUrl: `${appUrl}/documents/${documentId}?thread=${threadId}`,
          appUrl,
          recipientEmail: person.email,
          sentAt: new Date(),
        }),
      });
      emailed++;
    } catch (err) {
      console.error(
        JSON.stringify({ level: "error", message: "mention email failed to send", transport: env.EMAIL_TRANSPORT, documentId, error: (err as Error).message }),
      );
    }
  }
  return { emailed };
}
