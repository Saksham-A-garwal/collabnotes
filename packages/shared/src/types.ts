// DTOs shared between apps/web and apps/api. Source of truth: SRS §5.6.

// "commenter" can read and discuss but not change the document's content.
export type Role = "owner" | "editor" | "commenter" | "viewer";

export type UserPublic = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  // Whether to email this person when someone @mentions them in a comment.
  emailMentions: boolean;
};

export type DocumentSummary = {
  id: string;
  title: string;
  updatedAt: string;
  role: Role;
};

export type DocumentDetail = DocumentSummary & {
  createdAt: string;
  ownerId: string;
};

// userId/displayName are null for a pending invite (FR-19: an invite to an
// email with no account yet, granted once that person registers/logs in) —
// a small, additive extension of the SRS §5.6 shape, not present in the
// literal DTO there.
export type DocumentAccessEntry = {
  userId: string | null;
  displayName: string | null;
  email: string;
  role: Exclude<Role, "owner">;
  invitedAt: string;
  pending: boolean;
};

export type ShareLink = {
  token: string;
  url: string;
  role: Exclude<Role, "owner">;
};

export type SnapshotSummary = {
  id: string;
  createdAt: string;
  triggeredBy: "auto" | { userId: string; displayName: string };
};

export type AuthResponse = {
  user: UserPublic;
  accessToken: string;
  refreshToken: string;
};

// Passwordless sign-in: POST /auth/email/request, then /auth/email/verify.
export type RequestCodeResponse = {
  // Seconds before another code can be requested for this address.
  resendAfterSeconds: number;
  // How long the code just sent stays valid.
  expiresInSeconds: number;
};

export type VerifyCodeResponse = AuthResponse & {
  // True when this sign-in just created the account (drives the name step).
  isNewUser: boolean;
};

// What happened to the optional "notify by email" on an invite. Sharing itself
// always succeeds first; the email is best-effort and never blocks it.
export type InviteNotification =
  | "sent" // emailed
  | "not-requested" // the owner unticked "Notify by email"
  | "unchanged" // they already had exactly this access, so there is nothing new to tell them
  | "limited" // suppressed by a rate limit or the daily email budget
  | "failed"; // the email provider rejected or timed out

export type InviteResponse = {
  access: DocumentAccessEntry;
  notification: InviteNotification;
};

export type SearchResult = {
  id: string;
  title: string;
  role: Role;
  updatedAt: string;
  // A short excerpt with matched words wrapped in SEARCH_MARK_START/END, or null
  // when only the title matched.
  snippet: string | null;
};

export type SearchResponse = { results: SearchResult[] };

// ------------------------------------------------------------------ comments

export type CommentAuthor = { id: string; displayName: string };

export type CommentDTO = {
  id: string;
  threadId: string;
  author: CommentAuthor;
  body: string;
  // Users @mentioned in this comment (always people with access to the document).
  mentions: string[];
  createdAt: string;
  editedAt: string | null;
};

// Where a thread is pinned in the document. Two Yjs "relative positions" (as JSON):
// unlike a character offset they are stuck to the letters themselves, so they follow
// the text as other people type around it. Opaque to the server; only the editor
// interprets them, and it must treat them as untrusted (they may be stale or garbage).
export type CommentAnchor = { from: unknown; to: unknown };

export type CommentThreadDTO = {
  id: string;
  documentId: string;
  author: CommentAuthor;
  // The text that was selected, kept so a thread still makes sense if its anchor is lost
  // (the text was deleted, or the document was restored to an older version).
  quote: string;
  anchor: CommentAnchor | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: CommentAuthor | null;
  comments: CommentDTO[];
};

export type CommentsResponse = { threads: CommentThreadDTO[] };

// Someone who can be @mentioned in a document: its owner and everyone it is shared with.
// Names only; email addresses are never exposed to commenters.
export type CommentPerson = { id: string; displayName: string };
export type PeopleResponse = { people: CommentPerson[] };

// Something that happened to you in a document. Only mentions so far.
export type NotificationDTO = {
  id: string;
  kind: "mention";
  documentId: string;
  documentTitle: string;
  threadId: string;
  actor: CommentAuthor | null;
  // The text the thread is about, and the start of what was said.
  quote: string;
  excerpt: string;
  createdAt: string;
  readAt: string | null;
};

export type NotificationsResponse = { notifications: NotificationDTO[]; unreadCount: number };
