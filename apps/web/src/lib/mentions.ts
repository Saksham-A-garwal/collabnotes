import type { CommentPerson } from "@collabnotes/shared";

const MAX_QUERY = 30;
const MAX_SUGGESTIONS = 6;

export function activeMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("@");
  if (start < 0) return null;
  if (start > 0 && !/\s/.test(before[start - 1]!)) return null;
  const query = before.slice(start + 1);
  if (query.length > MAX_QUERY || query.includes("\n")) return null;
  return { start, query };
}

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

export function insertMention(text: string, start: number, caret: number, person: CommentPerson): { text: string; caret: number } {
  const inserted = `@${person.displayName} `;
  return { text: text.slice(0, start) + inserted + text.slice(caret), caret: start + inserted.length };
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function mentionPattern(names: string[]): RegExp | null {
  const unique = [...new Set(names.filter((n) => n.trim().length > 0))].sort((a, b) => b.length - a.length);
  if (unique.length === 0) return null;
  return new RegExp(`@(?:${unique.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`, "gu");
}

export function mentionedIds(body: string, chosen: ReadonlyMap<string, string>): string[] {
  const ids: string[] = [];
  for (const [id, name] of chosen) {
    const pattern = mentionPattern([name]);
    if (pattern && pattern.test(body)) ids.push(id);
  }
  return ids;
}

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
