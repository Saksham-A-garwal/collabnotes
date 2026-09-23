export function safeRedirectPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    if (ch === "\\" || code < 0x20 || code === 0x7f) return "/";
  }
  return raw;
}
