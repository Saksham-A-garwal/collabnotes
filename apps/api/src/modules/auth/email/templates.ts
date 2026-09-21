// The sign-in code email. Deliberately plain and defensive:
//  - table layout + inline styles, because mail clients ignore most modern CSS;
//  - no remote images or tracking pixels (clients block them, and they leak
//    when the email was opened) — the logo is a CSS-drawn mark;
//  - no buttons or links that log you in, so there is nothing to phish with;
//  - a dark-mode variant for clients that honour prefers-color-scheme;
//  - a plain-text alternative, which also improves deliverability.

export type SignInCodeEmailInput = {
  code: string;
  email: string;
  expiresInMinutes: number;
  appUrl: string;
  requestedAt: Date;
};

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

export function renderSignInCodeEmail(input: SignInCodeEmailInput): { subject: string; html: string; text: string } {
  const { code, expiresInMinutes, appUrl } = input;
  const email = escapeHtml(input.email);
  const when = formatUtc(input.requestedAt);
  const host = appUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const subject = "Your CollabNotes sign-in code";
  const preheader = `${code} is your sign-in code. It expires in ${expiresInMinutes} minutes.`;

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${subject}</title>
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
  }
  @media only screen and (max-width: 520px) {
    .pad { padding-left: 24px !important; padding-right: 24px !important; }
    .code { font-size: 30px !important; letter-spacing: 6px !important; }
  }
</style>
</head>
<body class="bg-page" style="margin:0;padding:0;background-color:#F7F7F5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#F7F7F5;">${preheader}${"&nbsp;&zwnj;".repeat(40)}</div>
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
            <h1 class="text-strong" style="margin:0 0 12px 0;font-family:${SANS};font-size:22px;line-height:1.3;font-weight:700;color:#37352F;">Your sign-in code</h1>
            <p class="text-body" style="margin:0 0 24px 0;font-family:${SANS};font-size:15px;line-height:1.6;color:#4B4A46;">Enter this code to finish signing in to CollabNotes as <strong class="text-strong" style="color:#37352F;">${email}</strong>. It expires in ${expiresInMinutes} minutes and works only once.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="bg-code code text-strong" align="center" style="background-color:#F7F7F5;border:1px solid #E9E9E7;border-radius:10px;padding:20px 12px;font-family:${MONO};font-size:36px;line-height:1;font-weight:700;letter-spacing:10px;color:#37352F;">${code}</td>
              </tr>
            </table>
            <p class="text-muted" style="margin:24px 0 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:#6B6A66;">For your security, never share this code — not even with someone who says they work at CollabNotes. We will never ask for it.</p>
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:24px 4px 0 4px;">
            <p class="text-muted" style="margin:0 0 12px 0;font-family:${SANS};font-size:13px;line-height:1.6;color:#6B6A66;">Didn't request this? You can safely ignore this email. Nobody can sign in without the code, and someone may have typed your address by mistake.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td class="rule" style="border-top:1px solid #E9E9E7;font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
            </table>
            <p class="text-muted" style="margin:12px 0 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:#8A8985;">Requested ${when}<br>CollabNotes &middot; Real-time collaborative notes &middot; ${escapeHtml(host)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

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
    `Requested ${when}`,
    `CollabNotes - ${host}`,
  ].join("\n");

  return { subject, html, text };
}
