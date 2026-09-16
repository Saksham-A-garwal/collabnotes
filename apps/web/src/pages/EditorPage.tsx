import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import type { DocumentDetail } from "@collabnotes/shared";
import { ConnectionStatusDot } from "../components/ConnectionStatusDot.js";
import { PresenceAvatarStack } from "../components/PresenceAvatarStack.js";
import { Toolbar } from "../components/Toolbar.js";
import { useAuth } from "../hooks/useAuth.js";
import { useAwarenessStates } from "../hooks/useAwarenessStates.js";
import { useRealtimeDocument } from "../hooks/useRealtimeDocument.js";
import { ApiRequestError } from "../lib/apiClient.js";
import { colorForUser } from "../lib/cursorColors.js";
import { documentsApi } from "../lib/documentsApi.js";

// Inline-editable title: click to edit, commit on blur/Enter, revert on
// Escape (04-UIUX.md §6). Only an Owner can rename (FR-9) — non-owners see
// plain text.
function EditableTitle({
  documentId,
  title,
  canEdit,
}: {
  documentId: string;
  title: string;
  canEdit: boolean;
}) {
  const [value, setValue] = useState(title);
  const [editing, setEditing] = useState(false);
  const committedRef = useRef(title);

  useEffect(() => {
    setValue(title);
    committedRef.current = title;
  }, [title]);

  async function commit() {
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed === committedRef.current) return;
    try {
      const { document } = await documentsApi.rename(documentId, trimmed);
      committedRef.current = document.title;
      setValue(document.title);
    } catch {
      setValue(committedRef.current);
    }
  }

  if (!canEdit) {
    return <span style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>{title}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        style={{
          background: "none",
          border: "none",
          font: "inherit",
          fontSize: "var(--text-lg)",
          fontWeight: 600,
          color: "var(--text-primary)",
          cursor: "text",
          padding: 0,
        }}
        aria-label="Edit document title"
      >
        {value}
      </button>
    );
  }

  return (
    <input
      className="input"
      style={{ fontSize: "var(--text-lg)", fontWeight: 600, maxWidth: 400 }}
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          setValue(committedRef.current);
          setEditing(false);
        }
      }}
    />
  );
}

export default function EditorPage() {
  const { id: documentId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [meta, setMeta] = useState<DocumentDetail | null>(null);
  const [metaError, setMetaError] = useState<"not_found" | "other" | null>(null);

  const { doc, provider, status, role, deletedMessage, toastMessage } = useRealtimeDocument(
    documentId!,
  );
  const collaborators = useAwarenessStates(provider?.awareness ?? null);

  useEffect(() => {
    documentsApi
      .get(documentId!)
      .then(({ document }) => setMeta(document))
      .catch((err) => {
        setMetaError(err instanceof ApiRequestError && err.status === 404 ? "not_found" : "other");
      });
  }, [documentId]);

  useEffect(() => {
    if (deletedMessage) {
      const t = setTimeout(() => navigate("/", { replace: true }), 2500);
      return () => clearTimeout(t);
    }
  }, [deletedMessage, navigate]);

  const editor = useEditor(
    {
      // Collaboration/CollaborationCursor need a real provider — until the
      // socket connects, fall back to a plain (never-rendered, since the
      // "Loading…" screen below covers this window) StarterKit instance
      // rather than constructing CollaborationCursor with a null provider.
      extensions: provider
        ? [
            StarterKit.configure({ history: false }), // Yjs/Collaboration owns undo history
            Underline,
            Link.configure({ openOnClick: false }),
            Collaboration.configure({ document: doc }),
            CollaborationCursor.configure({
              provider,
              user: user
                ? { name: user.displayName, color: colorForUser(user.id) }
                : { name: "", color: "" },
            }),
          ]
        : [StarterKit],
      editable: false,
    },
    [doc, provider],
  );

  useEffect(() => {
    editor?.setEditable(role !== "viewer");
  }, [editor, role]);

  if (metaError === "not_found") {
    return (
      <main style={{ padding: "var(--space-xl)", textAlign: "center" }}>
        <h1 style={{ fontSize: "var(--text-lg)" }}>You don't have access to this document</h1>
        <button type="button" className="btn btn-primary" onClick={() => navigate("/")}>
          Back to Dashboard
        </button>
      </main>
    );
  }

  if (metaError === "other") {
    return (
      <main style={{ padding: "var(--space-xl)", textAlign: "center" }}>
        <p className="field-error">Couldn't load this document.</p>
      </main>
    );
  }

  if (deletedMessage) {
    return (
      <main style={{ padding: "var(--space-xl)", textAlign: "center" }}>
        <p>{deletedMessage}</p>
      </main>
    );
  }

  if (!meta || status === "connecting") {
    return (
      <main style={{ display: "flex", justifyContent: "center", padding: "var(--space-xl)" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
      </main>
    );
  }

  return (
    <div>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-md) var(--space-xl)",
          background: "var(--bg-chrome)",
          gap: "var(--space-md)",
        }}
      >
        <button
          type="button"
          className="link-button"
          onClick={() => navigate("/")}
          style={{ textDecoration: "none", flexShrink: 0 }}
          aria-label="Back to Dashboard"
        >
          ← CollabNotes
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <EditableTitle documentId={documentId!} title={meta.title} canEdit={role === "owner"} />
          <div>
            <ConnectionStatusDot status={status} />
          </div>
        </div>

        <PresenceAvatarStack collaborators={collaborators} />

        <button type="button" className="btn btn-secondary" disabled title="Coming soon">
          Share
        </button>
        <button type="button" className="btn btn-secondary" disabled title="Coming soon">
          History
        </button>
      </header>

      <Toolbar editor={editor} disabled={role === "viewer"} />

      {toastMessage && (
        <p role="alert" className="field-error" style={{ padding: "var(--space-sm) var(--space-xl) 0" }}>
          {toastMessage}
        </p>
      )}

      <div className="editor-canvas-wrap">
        <EditorContent editor={editor} className="editor-canvas" />
      </div>
    </div>
  );
}
