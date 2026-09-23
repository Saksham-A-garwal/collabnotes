import { useEffect, useRef, useState } from "react";
import type { NotificationDTO } from "@collabnotes/shared";
import { BellIcon } from "./Icons.js";
import { useNotifications } from "../hooks/useNotifications.js";
import type { RealtimeProvider } from "../lib/realtimeProvider.js";
import { relativeTime } from "../lib/relativeTime.js";

export function NotificationBell({
  onOpen,
  provider = null,
}: {
  onOpen: (notification: NotificationDTO) => void;
  provider?: RealtimeProvider | null;
}) {
  const { notifications, unreadCount, loaded, refresh, markRead, markAllRead } = useNotifications(provider);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    void refresh();
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, refresh]);

  function choose(n: NotificationDTO) {
    markRead(n.id);
    setOpen(false);
    onOpen(n);
  }

  return (
    <div ref={rootRef} className="bell">
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn bell-btn"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="bell-badge" aria-hidden="true">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="popover notification-popover" role="region" aria-label="Notifications">
          <div className="notification-head">
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button type="button" className="link-button" onClick={markAllRead}>
                Mark all as read
              </button>
            )}
          </div>

          {loaded && notifications.length === 0 && (
            <p className="notification-empty">Nothing new. When someone mentions you in a comment, it shows up here.</p>
          )}
          {!loaded && <p className="notification-empty">Loading…</p>}

          <ul className="notification-list">
            {notifications.map((n) => (
              <li key={n.id}>
                <button type="button" className={n.readAt ? "notification" : "notification is-unread"} onClick={() => choose(n)}>
                  <span className="notification-title">
                    {!n.readAt && <span className="sr-only">Unread. </span>}
                    <strong>{n.actor?.displayName ?? "Someone"}</strong> mentioned you in <strong>{n.documentTitle || "Untitled document"}</strong>
                  </span>
                  <span className="notification-excerpt">{n.excerpt}</span>
                  <span className="notification-time">
                    <time dateTime={n.createdAt}>{relativeTime(n.createdAt)}</time>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
