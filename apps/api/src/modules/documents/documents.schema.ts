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
