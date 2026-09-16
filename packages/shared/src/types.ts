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

export type DocumentAccessEntry = {
  userId: string;
  displayName: string;
  email: string;
  role: Exclude<Role, "owner">;
  invitedAt: string;
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
