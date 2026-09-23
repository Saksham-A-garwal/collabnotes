import type { AuthResponse, RequestCodeResponse, UserPublic, VerifyCodeResponse } from "@collabnotes/shared";
import { apiFetch } from "./apiClient.js";

export const authApi = {
  requestCode: (email: string) =>
    apiFetch<RequestCodeResponse>("/auth/email/request", { method: "POST", body: { email }, skipAuthRetry: true }),

  verifyCode: (email: string, code: string) =>
    apiFetch<VerifyCodeResponse>("/auth/email/verify", { method: "POST", body: { email, code }, skipAuthRetry: true }),

  updateProfile: (displayName: string) =>
    apiFetch<{ user: UserPublic }>("/auth/me", { method: "PATCH", body: { displayName } }),

  updateEmailMentions: (emailMentions: boolean) =>
    apiFetch<{ user: UserPublic }>("/auth/me", { method: "PATCH", body: { emailMentions } }),

  oauthGoogle: (code: string) =>
    apiFetch<AuthResponse>("/auth/oauth/google", {
      method: "POST",
      body: { code },
      skipAuthRetry: true,
    }),

  logout: (refreshToken: string) =>
    apiFetch<void>("/auth/logout", { method: "POST", body: { refreshToken } }),
};
