import type { AuthResponse } from "@collabnotes/shared";
import { apiFetch } from "./apiClient.js";

export const authApi = {
  register: (params: { email: string; password: string; displayName: string }) =>
    apiFetch<AuthResponse>("/auth/register", { method: "POST", body: params, skipAuthRetry: true }),

  login: (params: { email: string; password: string }) =>
    apiFetch<AuthResponse>("/auth/login", { method: "POST", body: params, skipAuthRetry: true }),

  oauthGoogle: (code: string) =>
    apiFetch<AuthResponse>("/auth/oauth/google", {
      method: "POST",
      body: { code },
      skipAuthRetry: true,
    }),

  logout: (refreshToken: string) =>
    apiFetch<void>("/auth/logout", { method: "POST", body: { refreshToken } }),
};
