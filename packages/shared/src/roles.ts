import type { Role } from "./types.js";

// The one definition of who may do what, shared by the server (which enforces it)
// and the browser (which uses it to decide what to show). Keeping it in one place
// means a new role can't be handled in one spot and forgotten in another.

// Change the document's content.
export const canEditContent = (role: Role | null | undefined): boolean => role === "owner" || role === "editor";

// Add, reply to, and resolve comments. A commenter can discuss but not edit.
export const canComment = (role: Role | null | undefined): boolean =>
  role === "owner" || role === "editor" || role === "commenter";

// Limits on what a comment may contain.
export const COMMENT_BODY_MAX = 2000;
export const COMMENT_QUOTE_MAX = 500;

// Ceilings so one person with comment rights can't bury a document (and slow the editor
// of everyone who opens it) under thousands of threads.
export const MAX_THREADS_PER_DOCUMENT = 500;
export const MAX_COMMENTS_PER_THREAD = 200;
export const MENTIONS_MAX = 10;
