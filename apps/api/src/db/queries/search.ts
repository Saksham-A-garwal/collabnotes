import { SEARCH_MARK_END, SEARCH_MARK_START, type Role } from "@collabnotes/shared";
import { pool } from "../pool.js";

export type SearchRow = {
  id: string;
  title: string;
  updated_at: Date;
  role: Role;
  snippet: string | null;
};

// Only letters and digits survive, so what comes out is always safe to hand to
// to_tsquery (which would otherwise choke on, or be steered by, punctuation).
// The last word gets a prefix match, which is what makes search-as-you-type work:
// "roadm" finds "roadmap".
//
// Not applied when the query uses search syntax ("exact phrase", -excluded, OR):
// prefix-matching an excluded word would quietly undo the exclusion, so those
// queries keep their exact meaning.
export function prefixQueryFor(q: string): string {
  if (/(^|\s)-\S|"|\sor\s/i.test(q)) return "";
  const words = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.map((w, i) => (i === words.length - 1 ? `${w}:*` : w)).join(" & ");
}

// A literal % or _ in what someone types must match itself, not act as a wildcard.
export const likePattern = (q: string): string => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const HEADLINE_OPTIONS = `StartSel=${SEARCH_MARK_START}, StopSel=${SEARCH_MARK_END}, MaxWords=24, MinWords=12, MaxFragments=1`;

// The access check is part of the query, not a filter applied afterwards: a
// document the caller can't open is never selected, so it can't leak through
// ranking, counts or timing. "Can open" means the owner or a collaborator whose
// invite has been resolved to their account (a pending invite has no user_id,
// so it matches nothing).
//
// Matching, best first: a title hit, then full-text rank. `websearch_to_tsquery`
// understands "quoted phrases", OR and -exclusions and never throws on odd input;
// the prefix query and the title ILIKE add search-as-you-type and partial titles.
// The expensive part, building the highlighted snippet, runs only for the rows
// that survive the LIMIT.
export async function searchDocumentsForUser(userId: string, q: string, limit: number): Promise<SearchRow[]> {
  const result = await pool.query<SearchRow>(
    `WITH q AS (
       SELECT websearch_to_tsquery('english', $2) || to_tsquery('english', $3) AS tsq,
              websearch_to_tsquery('english', $2) AS exact
     ),
     hits AS (
       SELECT d.id, d.title, d.updated_at, d.search_text,
              CASE WHEN d.owner_id = $1 THEN 'owner' ELSE da.role END AS role,
              (d.title ILIKE $4) AS title_hit,
              (d.search_vector @@ q.tsq) AS text_hit,
              GREATEST(ts_rank_cd(d.search_vector, q.exact), ts_rank_cd(d.search_vector, q.tsq)) AS rank,
              q.tsq
       FROM documents d
       CROSS JOIN q
       LEFT JOIN document_access da ON da.document_id = d.id AND da.user_id = $1
       WHERE (d.owner_id = $1 OR da.user_id = $1)
         AND ((d.search_vector @@ q.tsq) OR (d.title ILIKE $4))
       ORDER BY (d.title ILIKE $4) DESC, rank DESC, d.updated_at DESC
       LIMIT $6
     )
     SELECT id, title, updated_at, role,
            CASE WHEN text_hit THEN ts_headline('english', search_text, tsq, $5) END AS snippet
     FROM hits
     ORDER BY title_hit DESC, rank DESC, updated_at DESC`,
    [userId, q, prefixQueryFor(q), likePattern(q), HEADLINE_OPTIONS, limit],
  );
  return result.rows;
}
