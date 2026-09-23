import type { Role } from "./types.js";

export const canEditContent = (role: Role | null | undefined): boolean => role === "owner" || role === "editor";

export const canComment = (role: Role | null | undefined): boolean =>
  role === "owner" || role === "editor" || role === "commenter";

export const COMMENT_BODY_MAX = 2000;
export const COMMENT_QUOTE_MAX = 500;

export const MAX_THREADS_PER_DOCUMENT = 500;
export const MAX_COMMENTS_PER_THREAD = 200;
export const MENTIONS_MAX = 10;
