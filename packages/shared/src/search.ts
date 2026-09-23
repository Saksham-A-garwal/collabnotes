export const SEARCH_MARK_START = String.fromCharCode(2);
export const SEARCH_MARK_END = String.fromCharCode(3);

export const SEARCH_QUERY_MAX = 200;
export const SEARCH_QUERY_MIN = 2;

export function splitSnippet(snippet: string): { text: string; match: boolean }[] {
  const parts: { text: string; match: boolean }[] = [];
  let rest = snippet;
  for (;;) {
    const start = rest.indexOf(SEARCH_MARK_START);
    if (start < 0) break;
    const end = rest.indexOf(SEARCH_MARK_END, start + 1);
    if (end < 0) break;
    if (start > 0) parts.push({ text: rest.slice(0, start), match: false });
    parts.push({ text: rest.slice(start + 1, end), match: true });
    rest = rest.slice(end + 1);
  }
  if (rest) parts.push({ text: rest, match: false });
  return parts;
}
