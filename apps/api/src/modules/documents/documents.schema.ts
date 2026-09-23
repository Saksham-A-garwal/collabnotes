import { SEARCH_QUERY_MAX, SEARCH_QUERY_MIN } from "@collabnotes/shared";
import { z } from "zod";

export const createDocumentSchema = z.object({
  title: z.string().max(200).optional(),
});

export const renameDocumentSchema = z.object({
  title: z.string().max(200),
});

export const documentIdParamSchema = z.object({ id: z.string().uuid() });

export const searchQuerySchema = z.object({
  q: z.string().trim().min(SEARCH_QUERY_MIN, "Type at least 2 characters.").max(SEARCH_QUERY_MAX),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
