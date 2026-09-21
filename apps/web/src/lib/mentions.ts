import type { CommentPerson } from "@collabnotes/shared";

// @mentions in the comment box. The text stays plain ("Can you check this, @Grace Hopper?")
// and the people it names travel beside it as ids; the server decides who really counts.

const MAX_QUERY = 30;
const MAX_SUGGESTIONS = 6;

// If the caret is right after "@something" that could still be a name being typed, say where
// the "@" is and what has been typed after it. An "@" only starts a mention at the beginning
// or after whitespace, so an email address like ada@example.com never opens the list.
export function activeMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("@");
  if (start < 0) return null;
  if (start > 0 && !/\s/.test(before[start - 1]!)) return null;
  const query = before.slice(start + 1);
  if (query.length > MAX_QUERY || query.includes("\n")) return null;
  return { start, query };
}

// People whose name starts with what was typed come first, then those with a word that
// does, then those that merely contain it.
export function matchPeople(people: CommentPerson[], query: string): CommentPerson[] {
  const q = query.trim().toLowerCase();
  const rank = (p: CommentPerson): number => {
    const name = p.displayName.toLowerCase();
    if (name.startsWith(q)) return 0;
    if (name.split(/\s+/).some((word) => word.startsWith(q))) return 1;
    return name.includes(q) ? 2 : 3;
  };
  return people
    .map((p) => ({ p, r: rank(p) }))
    .filter((x) => x.r < 3)
    .sort((a, b) => a.r - b.r || a.p.displayName.localeCompare(b.p.displayName))
    .slice(0, MAX_SUGGESTIONS)
    .map((x) => x.p);
}

// Replace the "@query" being typed with the chosen person, followed by a space.
export function insertMention(text: string, start: number, caret: number, person: CommentPerson): { text: string; caret: number } {
  const inserted = `@${person.displayName} `;
  return { text: text.slice(0, start) + inserted + text.slice(caret), caret: start + inserted.length };
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// "@Name" as a whole: not the start of a longer word ("@Adam" is not a mention of "Ada").
function mentionPattern(names: string[]): RegExp | null {
  const unique = [...new Set(names.filter((n) => n.trim().length > 0))].sort((a, b) => b.length - a.length);
  if (unique.length === 0) return null;
  return new RegExp(`@(?:${unique.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`, "gu");
}

// Of the people picked while writing, the ones still actually named in the text: deleting
// "@Grace Hopper" from the box also takes her off the list.
export function mentionedIds(body: string, chosen: ReadonlyMap<string, string>): string[] {
  const ids: string[] = [];
  for (const [id, name] of chosen) {
    const pattern = mentionPattern([name]);
    if (pattern && pattern.test(body)) ids.push(id);
  }
  return ids;
}

// The text cut into pieces so the mentions can be styled, as text nodes rather than HTML.
export function splitMentions(body: string, names: string[]): { text: string; mention: boolean }[] {
  const pattern = mentionPattern(names);
  if (!pattern) return [{ text: body, mention: false }];
  const parts: { text: string; mention: boolean }[] = [];
  let last = 0;
  for (const match of body.matchAll(pattern)) {
    const at = match.index!;
    if (at > last) parts.push({ text: body.slice(last, at), mention: false });
    parts.push({ text: match[0], mention: true });
    last = at + match[0].length;
  }
  if (last < body.length) parts.push({ text: body.slice(last), mention: false });
  return parts;
}
