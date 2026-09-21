import { SEARCH_QUERY_MAX, SEARCH_QUERY_MIN } from "@collabnotes/shared";
import { z } from "zod";

// Validation rules per SRS §7: title is 1-200 chars, but empty input is
// never rejected — it defaults to "Untitled document" server-side.
export const createDocumentSchema = z.object({
  title: z.string().max(200).optional(),
});

export const renameDocumentSchema = z.object({
  title: z.string().max(200),
});

export const documentIdParamSchema = z.object({ id: z.string().uuid() });

// Trimmed first, so a query that is only spaces is rejected rather than sent to
// the database. The cap bounds the work one request can ask for.
export const searchQuerySchema = z.object({
  q: z.string().trim().min(SEARCH_QUERY_MIN, "Type at least 2 characters.").max(SEARCH_QUERY_MAX),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
