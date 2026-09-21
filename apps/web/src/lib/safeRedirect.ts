// Where to send someone after sign-in when the URL asks for a destination
// (?redirect=…). It's attacker-controllable — anyone can hand out a login link
// — so only a plain in-app path is honoured; everything else falls back to "/".
//
// A regex for "starts with one slash" isn't enough. Browsers normalise URLs
// before resolving them: "\" is treated as "/", and tab/CR/LF are stripped.
// So "/\evil.com" and "/<TAB>/evil.com" both collapse to "//evil.com", a
// protocol-relative link to another site.
export function safeRedirectPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    if (ch === "\\" || code < 0x20 || code === 0x7f) return "/";
  }
  return raw;
}
