import { env } from "../../config/env.js";
import { createMentionNotifications, getRecipients } from "../../db/queries/comments.js";
import { getRoomManager } from "../../realtime/index.js";
import { sendEmail } from "../auth/email/mailer.js";
import { claimCooldown, takeDailySlot, withinWindow } from "../auth/email/quota.js";
import { renderMentionEmail } from "../auth/email/templates.js";

// Mentioning someone makes CollabNotes email them, so like invitations it's fenced before
// anything is sent, and none of it can ever fail the comment itself:
//
//  - the person's own switch ("Email me when I'm mentioned") and their presence: someone
//    already looking at the document sees it happen and isn't emailed
//  - per (thread, recipient) cooldown: a back-and-forth doesn't send one email per reply
//  - per author per hour: one person can't use @mentions to fan mail out
//  - per recipient per hour: nobody gets buried, however many people mention them
//  - the shared daily budget, which stops short of the sign-in reserve
// The in-app notification is recorded regardless: it's the durable record, the email a nudge.
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
        // Realtime not attached (tests, scripts): treat as not present.
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
          // A plain link into the app, no token: opening it signed out goes through sign-in
          // and lands back on the thread.
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
