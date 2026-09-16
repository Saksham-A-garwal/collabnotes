import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import type { Role } from "@collabnotes/shared";
import { colorForUser } from "../lib/cursorColors.js";
import { RealtimeProvider, type ConnectionStatus } from "../lib/realtimeProvider.js";
import { useAuth } from "./useAuth.js";

export function useRealtimeDocument(documentId: string) {
  const { user } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [role, setRole] = useState<Role | null>(null);
  const [deletedMessage, setDeletedMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [provider, setProvider] = useState<RealtimeProvider | null>(null);

  // Plain object construction, no I/O — safe during render, and the ref
  // keeps the same Y.Doc identity across React StrictMode's double-render.
  const docRef = useRef<Y.Doc | null>(null);
  if (!docRef.current) docRef.current = new Y.Doc();
  const doc = docRef.current;

  // Opening the socket is a real side effect and must only happen in an
  // effect. StrictMode's dev-only mount/unmount/remount cycle exists
  // specifically to catch side effects created during render (e.g. inside
  // useMemo, as this used to do) — it doubled the socket.io connection.
  useEffect(() => {
    const p = new RealtimeProvider(documentId, doc);
    setProvider(p);

    const unsubStatus = p.onStatusChange(setStatus);
    const unsubRole = p.onRoleChange(setRole);
    const unsubError = p.onError(setToastMessage);
    const unsubDeleted = p.onDeleted(setDeletedMessage);

    return () => {
      unsubStatus();
      unsubRole();
      unsubError();
      unsubDeleted();
      p.destroy();
      setProvider(null);
    };
  }, [documentId, doc]);

  useEffect(() => {
    if (provider && user) provider.setLocalUser({ name: user.displayName, color: colorForUser(user.id) });
  }, [provider, user]);

  return { doc, provider, status, role, deletedMessage, toastMessage };
}
