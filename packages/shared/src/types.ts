export type Role = "owner" | "editor" | "commenter" | "viewer";

export type UserPublic = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
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

export type RequestCodeResponse = {
  resendAfterSeconds: number;
  expiresInSeconds: number;
};

export type VerifyCodeResponse = AuthResponse & {
  isNewUser: boolean;
};

export type InviteNotification =
  | "sent"
  | "not-requested"
  | "unchanged"
  | "limited"
  | "failed";

export type InviteResponse = {
  access: DocumentAccessEntry;
  notification: InviteNotification;
};

export type SearchResult = {
  id: string;
  title: string;
  role: Role;
  updatedAt: string;
  snippet: string | null;
};

export type SearchResponse = { results: SearchResult[] };

export type CommentAuthor = { id: string; displayName: string };

export type CommentDTO = {
  id: string;
  threadId: string;
  author: CommentAuthor;
  body: string;
  mentions: string[];
  createdAt: string;
  editedAt: string | null;
};

export type CommentAnchor = { from: unknown; to: unknown };

export type CommentThreadDTO = {
  id: string;
  documentId: string;
  author: CommentAuthor;
  quote: string;
  anchor: CommentAnchor | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: CommentAuthor | null;
  comments: CommentDTO[];
};

export type CommentsResponse = { threads: CommentThreadDTO[] };

export type CommentPerson = { id: string; displayName: string };
export type PeopleResponse = { people: CommentPerson[] };

export type NotificationDTO = {
  id: string;
  kind: "mention";
  documentId: string;
  documentTitle: string;
  threadId: string;
  actor: CommentAuthor | null;
  quote: string;
  excerpt: string;
  createdAt: string;
  readAt: string | null;
};

export type NotificationsResponse = { notifications: NotificationDTO[]; unreadCount: number };
