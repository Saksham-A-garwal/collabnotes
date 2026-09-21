import { SEARCH_MARK_START, type SearchResult } from "@collabnotes/shared";
import { searchDocumentsForUser } from "../../db/queries/search.js";

export async function searchDocuments(userId: string, rawQuery: string, limit: number): Promise<SearchResult[]> {
  const q = rawQuery.trim().replace(/\s+/g, " ");
  const rows = await searchDocumentsForUser(userId, q, limit);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    role: row.role,
    updatedAt: row.updated_at.toISOString(),
    // A snippet with no highlight means only the title matched; there's nothing
    // useful to show from the body then.
    snippet: row.snippet && row.snippet.includes(SEARCH_MARK_START) ? row.snippet : null,
  }));
}
