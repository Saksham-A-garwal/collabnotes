import { SEARCH_MARK_END, SEARCH_MARK_START, type Role } from "@collabnotes/shared";
import { pool } from "../pool.js";

export type SearchRow = {
  id: string;
  title: string;
  updated_at: Date;
  role: Role;
  snippet: string | null;
};

export function prefixQueryFor(q: string): string {
  if (/(^|\s)-\S|"|\sor\s/i.test(q)) return "";
  const words = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.map((w, i) => (i === words.length - 1 ? `${w}:*` : w)).join(" & ");
}

export const likePattern = (q: string): string => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const HEADLINE_OPTIONS = `StartSel=${SEARCH_MARK_START}, StopSel=${SEARCH_MARK_END}, MaxWords=24, MinWords=12, MaxFragments=1`;

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
