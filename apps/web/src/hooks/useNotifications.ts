import { useCallback, useEffect, useState } from "react";
import type { NotificationDTO } from "@collabnotes/shared";
import { notificationsApi } from "../lib/notificationsApi.js";
import type { RealtimeProvider } from "../lib/realtimeProvider.js";

const POLL_MS = 60_000;

export function useNotifications(provider: RealtimeProvider | null = null) {
  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await notificationsApi.list();
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
      setLoaded(true);
    } catch {
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  useEffect(() => (provider ? provider.onNotification(() => void refresh()) : undefined), [provider, refresh]);

  const markRead = useCallback(
    (id: string) => {
      setNotifications((list) => list.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)));
      setUnreadCount((n) => Math.max(0, n - 1));
      notificationsApi.markRead(id).catch(() => void refresh());
    },
    [refresh],
  );

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    setNotifications((list) => list.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setUnreadCount(0);
    notificationsApi.markAllRead().catch(() => void refresh());
  }, [refresh]);

  return { notifications, unreadCount, loaded, refresh, markRead, markAllRead };
}
