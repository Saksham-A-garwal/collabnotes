import type { NotificationsResponse } from "@collabnotes/shared";
import { apiFetch } from "./apiClient.js";

export const notificationsApi = {
  list: () => apiFetch<NotificationsResponse>("/notifications"),
  markRead: (id: string) => apiFetch<void>(`/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () => apiFetch<void>("/notifications/read-all", { method: "POST" }),
};
