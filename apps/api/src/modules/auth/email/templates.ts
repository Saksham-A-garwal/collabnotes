// Transactional emails, on one shared shell so they read as one product.
// Deliberately plain and defensive:
//  - table layout + inline styles, because mail clients ignore most modern CSS;
//  - no remote images or tracking pixels (clients block them, and they leak
//    when the email was opened) — the logo is a CSS-drawn mark;
//  - a dark-mode variant for clients that honour prefers-color-scheme;
//  - a plain-text alternative, which also improves deliverability;
//  - every user-supplied value (names, document titles, addresses) is escaped.
//
// The sign-in code email carries no links at all, so there is nothing in it to
// phish with. The invitation email has one button to open the document — a plain
// link into the app, with no token in it (access is tied to the recipient's
// verified email, so a forwarded message grants a stranger nothing).

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono','Courier New',monospace";

// "Mon, 21 Sep 2026, 06:14 UTC" — unambiguous without knowing the reader's zone.
function formatUtc(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date);
  return `${parts} UTC`;
}

const hostOf = (appUrl: string): string => appUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

// A value headed for a Subject line: no control characters (header injection),
// no runaway length, and never empty.
export function subjectSafe(value: string, max = 90): string {
  // Character-code checks rather than a regex of escapes: clearer, and there is
  // no escape sequence to get mangled. Control characters, DEL and the Unicode
  // line/paragraph separators all become spaces.
  let flat = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    flat += code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029 ? " " : ch;
  }
  flat = flat.replace(/\s+/g, " ").trim();
  const clipped = flat.length > max ? flat.slice(0, max - 1).trimEnd() + String.fromCharCode(0x2026) : flat;
  return clipped || "Untitled";
}

type Shell = { subject: string; preheader: string; card: string; footer: string; requestedAt: Date; appUrl: string };

function renderShell({ subject, preheader, card, footer, requestedAt, appUrl }: Shell): string {
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .bg-page { background-color: #191919 !important; }
    .bg-card { background-color: #202020 !important; border-color: #2F2F2F !important; }
    .bg-code { background-color: #2B2B2B !important; border-color: #3A3A3A !important; }
    .text-strong { color: #F5F5F4 !important; }
    .text-body { color: #D3D3D0 !important; }
    .text-muted { color: #9B9B97 !important; }
    .rule { border-color: #2F2F2F !important; }
    .mark { background-color: #F5F5F4 !important; color: #191919 !important; }
    .btn { background-color: #5AA2F5 !important; }
    .btn-link { color: #0B1F38 !important; }
  }
  @media only screen and (max-width: 520px) {
    .pad { padding-left: 24px !important; padding-right: 24px !important; }
    .code { font-size: 30px !important; letter-spacing: 6px !important; }
  }
</style>
</head>
<body class="bg-page" style="margin:0;padding:0;background-color:#F7F7F5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#F7F7F5;">${escapeHtml(preheader)}${"&nbsp;&zwnj;".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-page" style="background-color:#F7F7F5;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
        <tr>
          <td style="padding:0 4px 20px 4px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="mark" width="28" height="28" align="center" valign="middle" style="width:28px;height:28px;background-color:#37352F;color:#FFFFFF;border-radius:7px;font-family:${SANS};font-size:15px;font-weight:700;line-height:28px;">C</td>
                <td class="text-strong" style="padding-left:10px;font-family:${SANS};font-size:16px;font-weight:600;color:#37352F;">CollabNotes</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="bg-card pad" style="background-color:#FFFFFF;border:1px solid #E9E9E7;border-radius:12px;padding:36px 40px;">
${card}
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:24px 4px 0 4px;">
            <p class="text-muted" style="margin:0 0 12px 0;font-family:${SANS};font-size:13px;line-height:1.6;color:#6B6A66;">${footer}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td class="rule" style="border-top:1px solid #E9E9E7;font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
            </table>
            <p class="text-muted" style="margin:12px 0 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:#8A8985;">Sent ${escapeHtml(formatUtc(requestedAt))}<br>CollabNotes &middot; Real-time collaborative notes &middot; ${escapeHtml(hostOf(appUrl))}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ------------------------------------------------------------- sign-in code

export type SignInCodeEmailInput = {
  code: string;
  email: string;
  expiresInMinutes: number;
  appUrl: string;
  requestedAt: Date;
};

export function renderSignInCodeEmail(input: SignInCodeEmailInput): { subject: string; html: string; text: string } {
  const { code, expiresInMinutes, appUrl } = input;
  const email = escapeHtml(input.email);
  const subject = "Your CollabNotes sign-in code";

  const card = `            <h1 class="text-strong" style="margin:0 0 12px 0;font-family:${SANS};font-size:22px;line-height:1.3;font-weight:700;color:#37352F;">Your sign-in code</h1>
            <p class="text-body" style="margin:0 0 24px 0;font-family:${SANS};font-size:15px;line-height:1.6;color:#4B4A46;">Enter this code to finish signing in to CollabNotes as <strong class="text-strong" style="color:#37352F;">${email}</strong>. It expires in ${expiresInMinutes} minutes and works only once.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="bg-code code text-strong" align="center" style="background-color:#F7F7F5;border:1px solid #E9E9E7;border-radius:10px;padding:20px 12px;font-family:${MONO};font-size:36px;line-height:1;font-weight:700;letter-spacing:10px;color:#37352F;">${code}</td>
              </tr>
            </table>
            <p class="text-muted" style="margin:24px 0 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:#6B6A66;">For your security, never share this code — not even with someone who says they work at CollabNotes. We will never ask for it.</p>`;

  const html = renderShell({
    subject,
    preheader: `${code} is your sign-in code. It expires in ${expiresInMinutes} minutes.`,
    card,
    footer: "Didn't request this? You can safely ignore this email. Nobody can sign in without the code, and someone may have typed your address by mistake.",
    requestedAt: input.requestedAt,
    appUrl,
  });

  const text = [
    "CollabNotes",
    "",
    "Your sign-in code",
    "",
    `Enter this code to finish signing in as ${input.email}:`,
    "",
    `    ${code}`,
    "",
    `It expires in ${expiresInMinutes} minutes and works only once.`,
    "",
    "For your security, never share this code - not even with someone who says they work at CollabNotes. We will never ask for it.",
    "",
    "Didn't request this? You can safely ignore this email. Nobody can sign in without the code.",
    "",
    "--",
    `Requested ${formatUtc(input.requestedAt)}`,
    `CollabNotes - ${hostOf(appUrl)}`,
  ].join("\n");

  return { subject, html, text };
}

// --------------------------------------------------------------- invitation

export type InviteEmailInput = {
  inviterName: string;
  documentTitle: string;
  role: "editor" | "commenter" | "viewer";
  recipientEmail: string;
  // False when nothing has signed in with this address yet — the email then also
  // explains how signing in works, since they have no account to open it from.
  recipientHasAccount: boolean;
  documentUrl: string;
  appUrl: string;
  sentAt: Date;
};

export function renderInviteEmail(input: InviteEmailInput): { subject: string; html: string; text: string } {
  const { role, documentUrl, appUrl, recipientHasAccount } = input;
  const inviter = input.inviterName.trim() || "Someone";
  const title = input.documentTitle.trim() || "Untitled document";
  // "edit", "comment on", "view" read naturally after "invited you to"; the bare
  // verb is what fits "You can ...".
  const can = role === "editor" ? "edit" : role === "commenter" ? "comment on" : "view";
  const canShort = role === "editor" ? "edit" : role === "commenter" ? "comment" : "view";
  const subject = `${subjectSafe(inviter, 40)} invited you to “${subjectSafe(title, 60)}”`;

  const inviterHtml = escapeHtml(inviter);
  const newUserNote = recipientHasAccount
    ? ""
    : `
            <p class="text-body" style="margin:20px 0 0 0;font-family:${SANS};font-size:14px;line-height:1.6;color:#4B4A46;">New to CollabNotes? Sign in with <strong class="text-strong" style="color:#37352F;">${escapeHtml(input.recipientEmail)}</strong> — we&rsquo;ll email you a 6-digit code, so there&rsquo;s no password to set up.</p>`;

  const card = `            <h1 class="text-strong" style="margin:0 0 12px 0;font-family:${SANS};font-size:22px;line-height:1.3;font-weight:700;color:#37352F;">${inviterHtml} shared a document with you</h1>
            <p class="text-body" style="margin:0 0 20px 0;font-family:${SANS};font-size:15px;line-height:1.6;color:#4B4A46;"><strong class="text-strong" style="color:#37352F;">${inviterHtml}</strong> invited you to ${can} a document on CollabNotes.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="bg-code" style="background-color:#F7F7F5;border:1px solid #E9E9E7;border-radius:10px;padding:16px 18px;">
                  <div class="text-muted" style="font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#6B6A66;">Document</div>
                  <div class="text-strong" style="margin-top:4px;font-family:${SANS};font-size:18px;line-height:1.35;font-weight:600;color:#37352F;word-break:break-word;">${escapeHtml(title)}</div>
                  <div class="text-muted" style="margin-top:6px;font-family:${SANS};font-size:13px;color:#6B6A66;">You can ${canShort} &middot; Shared by ${inviterHtml}</div>
                </td>
              </tr>
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0 0;">
              <tr>
                <td class="btn" bgcolor="#1B6FD1" style="border-radius:8px;background-color:#1B6FD1;">
                  <a href="${escapeHtml(documentUrl)}" class="btn-link" style="display:inline-block;padding:12px 22px;font-family:${SANS};font-size:15px;font-weight:600;line-height:1.2;color:#FFFFFF;text-decoration:none;border-radius:8px;">Open document</a>
                </td>
              </tr>
            </table>${newUserNote}
            <p class="text-muted" style="margin:20px 0 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:#8A8985;word-break:break-all;">Button not working? Copy this link into your browser:<br>${escapeHtml(documentUrl)}</p>`;

  const html = renderShell({
    subject,
    preheader: `${inviter} invited you to ${can} “${title}”.`,
    card,
    footer: `You're receiving this because ${inviterHtml} shared a document with ${escapeHtml(input.recipientEmail)}. If you weren't expecting it, you can ignore this email &mdash; nothing changes until you open the link and sign in.`,
    requestedAt: input.sentAt,
    appUrl,
  });

  const text = [
    "CollabNotes",
    "",
    `${inviter} shared a document with you`,
    "",
    `${inviter} invited you to ${can} a document on CollabNotes:`,
    "",
    `    ${title}`,
    `    You can ${canShort} - shared by ${inviter}`,
    "",
    `Open it: ${documentUrl}`,
    ...(recipientHasAccount
      ? []
      : ["", `New to CollabNotes? Sign in with ${input.recipientEmail} - we'll email you a 6-digit code, so there's no password to set up.`]),
    "",
    `You're receiving this because ${inviter} shared a document with ${input.recipientEmail}. If you weren't expecting it, you can ignore this email - nothing changes until you open the link and sign in.`,
    "",
    "--",
    `Sent ${formatUtc(input.sentAt)}`,
    `CollabNotes - ${hostOf(appUrl)}`,
  ].join("\n");

  return { subject, html, text };
}

// ------------------------------------------------------------------ mention

export type MentionEmailInput = {
  authorName: string;
  documentTitle: string;
  // The text the thread is attached to, and what was said.
  quote: string;
  body: string;
  threadUrl: string;
  appUrl: string;
  recipientEmail: string;
  sentAt: Date;
};

// A comment can be long; an email is a nudge to go and read it, not the conversation.
function excerpt(value: string, max: number): string {
  const flat = value.replace(/\r\n/g, "\n").trim();
  return flat.length > max ? flat.slice(0, max - 1).trimEnd() + String.fromCharCode(0x2026) : flat;
}

export function renderMentionEmail(input: MentionEmailInput): { subject: string; html: string; text: string } {
  const author = input.authorName.trim() || "Someone";
  const title = input.documentTitle.trim() || "Untitled document";
  const quote = excerpt(input.quote, 200);
  const body = excerpt(input.body, 600);
  const subject = `${subjectSafe(author, 40)} mentioned you in ${String.fromCharCode(0x201c)}${subjectSafe(title, 60)}${String.fromCharCode(0x201d)}`;
  const authorHtml = escapeHtml(author);
  const bodyHtml = escapeHtml(body).replace(/\n/g, "<br>");

  const card = `            <h1 class="text-strong" style="margin:0 0 12px 0;font-family:${SANS};font-size:22px;line-height:1.3;font-weight:700;color:#37352F;">${authorHtml} mentioned you in a comment</h1>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="bg-code" style="background-color:#F7F7F5;border:1px solid #E9E9E7;border-radius:10px;padding:16px 18px;">
                  <div class="text-muted" style="font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#6B6A66;">Document</div>
                  <div class="text-strong" style="margin-top:4px;font-family:${SANS};font-size:16px;line-height:1.35;font-weight:600;color:#37352F;word-break:break-word;">${escapeHtml(title)}</div>
                  <div class="text-muted" style="margin-top:12px;padding-left:10px;border-left:3px solid #D9A400;font-family:${SANS};font-size:13px;line-height:1.5;color:#6B6A66;word-break:break-word;">${escapeHtml(quote)}</div>
                  <div class="text-strong" style="margin-top:12px;font-family:${SANS};font-size:15px;line-height:1.55;color:#37352F;word-break:break-word;"><strong>${authorHtml}</strong><br>${bodyHtml}</div>
                </td>
              </tr>
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0 0;">
              <tr>
                <td class="btn" bgcolor="#1B6FD1" style="border-radius:8px;background-color:#1B6FD1;">
                  <a href="${escapeHtml(input.threadUrl)}" class="btn-link" style="display:inline-block;padding:12px 22px;font-family:${SANS};font-size:15px;font-weight:600;line-height:1.2;color:#FFFFFF;text-decoration:none;border-radius:8px;">View comment</a>
                </td>
              </tr>
            </table>
            <p class="text-muted" style="margin:20px 0 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:#8A8985;word-break:break-all;">Button not working? Copy this link into your browser:<br>${escapeHtml(input.threadUrl)}</p>`;

  const html = renderShell({
    subject,
    preheader: `${author}: ${excerpt(input.body, 90)}`,
    card,
    footer: `You're receiving this because ${authorHtml} mentioned you in a comment on a document you can open. To stop these emails, turn off &ldquo;Email me when I&rsquo;m mentioned&rdquo; in the account menu in CollabNotes.`,
    requestedAt: input.sentAt,
    appUrl: input.appUrl,
  });

  const text = [
    "CollabNotes",
    "",
    `${author} mentioned you in a comment`,
    "",
    `Document: ${title}`,
    `On: ${quote}`,
    "",
    `${author}: ${body}`,
    "",
    `View it: ${input.threadUrl}`,
    "",
    `You're receiving this because ${author} mentioned you in a comment on a document you can open. To stop these emails, turn off "Email me when I'm mentioned" in the account menu in CollabNotes.`,
    "",
    "--",
    `Sent ${formatUtc(input.sentAt)}`,
    `CollabNotes - ${hostOf(input.appUrl)}`,
  ].join("\n");

  return { subject, html, text };
}
