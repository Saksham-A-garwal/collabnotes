import { COMMENT_BODY_MAX, COMMENT_QUOTE_MAX, MENTIONS_MAX } from "@collabnotes/shared";
import { z } from "zod";

const body = z.string().trim().min(1, "Write something first.").max(COMMENT_BODY_MAX, `Keep it under ${COMMENT_BODY_MAX} characters.`);

const position = z.record(z.string(), z.unknown());
const anchor = z
  .object({ from: position, to: position })
  .refine((a) => JSON.stringify(a).length <= 4000, "Anchor is too large.");

export const documentParamSchema = z.object({ id: z.string().uuid() });
export const threadParamSchema = z.object({ id: z.string().uuid(), threadId: z.string().uuid() });
export const commentParamSchema = z.object({
  id: z.string().uuid(),
  threadId: z.string().uuid(),
  commentId: z.string().uuid(),
});

const mentions = z.array(z.string().uuid()).max(MENTIONS_MAX).default([]);

export const createThreadSchema = z.object({
  quote: z.string().trim().min(1, "Select some text to comment on.").max(COMMENT_QUOTE_MAX),
  anchor: anchor.nullable().optional(),
  body,
  mentions,
});
export const replySchema = z.object({ body, mentions });
export const editCommentSchema = z.object({ body, mentions });
export const resolveSchema = z.object({ resolved: z.boolean() });
