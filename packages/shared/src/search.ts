// Search results carry a snippet of the matching text. The database wraps each
// matched word in these two markers, and the browser splits on them to render
// highlights as React text nodes — never as HTML, so a document's text can never
// become markup.
//
// They are control characters (STX / ETX), which the server strips out of every
// document's text before indexing (extractText.ts), so they cannot occur in real
// content and a match can never be faked. Built with fromCharCode rather than an
// escape sequence so no tool can turn them into a literal character in source.
export const SEARCH_MARK_START = String.fromCharCode(2);
export const SEARCH_MARK_END = String.fromCharCode(3);

// Longest query the server will act on, and the shortest worth searching for.
export const SEARCH_QUERY_MAX = 200;
export const SEARCH_QUERY_MIN = 2;

// Splits a snippet into alternating plain and highlighted pieces.
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
