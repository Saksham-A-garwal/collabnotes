// DTOs shared between apps/web and apps/api. Source of truth: SRS §5.6.

export type Role = "owner" | "editor" | "viewer";

export type UserPublic = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
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
