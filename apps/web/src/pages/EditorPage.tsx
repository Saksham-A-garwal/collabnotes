import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import type { DocumentDetail, Role } from "@collabnotes/shared";
import { ChevronLeftIcon, ClockIcon } from "../components/Icons.js";
import { ConnectionStatusDot } from "../components/ConnectionStatusDot.js";
import { ExportMenu } from "../components/ExportMenu.js";
import { PresenceAvatarStack } from "../components/PresenceAvatarStack.js";
import { ShareModal } from "../components/ShareModal.js";
import { Toolbar } from "../components/Toolbar.js";
import { VersionHistoryPanel } from "../components/VersionHistoryPanel.js";
import { useAuth } from "../hooks/useAuth.js";
import { useAwarenessStates } from "../hooks/useAwarenessStates.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { useRealtimeDocument } from "../hooks/useRealtimeDocument.js";
import { ApiRequestError } from "../lib/apiClient.js";
import { colorForUser, renderCursor } from "../lib/cursorColors.js";
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
    return <span>{title}</span>;
  }

  if (!editing) {
    return (
      <button type="button" className="title-button" onClick={() => setEditing(true)} aria-label="Edit document title">
        {value}
      </button>
    );
  }

  return (
    <input
      className="input"
      style={{ fontWeight: 600, maxWidth: 400, minHeight: 34 }}
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [restoredNotice, setRestoredNotice] = useState(false);
  // UIUX §6: a role change mid-session is announced, and — per WCAG 2.2.1 —
  // stays until the user dismisses it rather than fading on a timer.
  const [accessNotice, setAccessNotice] = useState<string | null>(null);
  const previousRole = useRef<Role | null>(null);
  const narrow = useMediaQuery("(max-width: 480px)");
  useDocumentTitle(meta?.title ?? "");

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

  function handleRestored() {
    setHistoryOpen(false);
    setRestoredNotice(true);
  }

  useEffect(() => {
    if (!restoredNotice) return;
    const t = setTimeout(() => setRestoredNotice(false), 4000);
    return () => clearTimeout(t);
  }, [restoredNotice]);

  useEffect(() => {
    if (deletedMessage) {
      const t = setTimeout(() => navigate("/", { replace: true }), 2500);
      return () => clearTimeout(t);
    }
  }, [deletedMessage, navigate]);

  const editor = useEditor(
    {
      // Collaboration/CollaborationCaret need a real provider — until the
      // socket connects, fall back to a plain (never-rendered, since the
      // "Loading…" screen below covers this window) StarterKit instance
      // rather than constructing CollaborationCaret with a null provider.
      extensions: provider
        ? [
            // Yjs/Collaboration owns undo history, so StarterKit's own is off.
            // Underline and Link ship inside StarterKit as of Tiptap 3.
            StarterKit.configure({ undoRedo: false, link: { openOnClick: false } }),
            Placeholder.configure({ placeholder: "Start writing…" }),
            Markdown, // adds editor.getMarkdown(), used by Export
            Collaboration.configure({ document: doc }),
            CollaborationCaret.configure({
              provider,
              render: renderCursor,
              user: user
                ? { name: user.displayName, color: colorForUser(user.id) }
                : { name: "", color: "" },
            }),
          ]
        : [StarterKit],
      editable: false,
      // The name has to be on the contenteditable itself (which carries
      // role="textbox"); a label on EditorContent's wrapper div doesn't reach it,
      // leaving screen readers an unnamed text box (WCAG 4.1.2).
      editorProps: { attributes: { "aria-label": "Document content" } },
    },
    [doc, provider],
  );

  useEffect(() => {
    editor?.setEditable(role !== "viewer");
  }, [editor, role]);

  useEffect(() => {
    if (role && previousRole.current && previousRole.current !== role) {
      setAccessNotice(role === "viewer" ? "Your access changed to view-only." : `Your access changed to ${role}.`);
    }
    if (role) previousRole.current = role;
  }, [role]);

  if (metaError === "not_found") {
    return (
      <main className="center-page" id="main">
        <h1>You don&rsquo;t have access to this document</h1>
        <p>It may have been deleted, or the owner hasn&rsquo;t shared it with you.</p>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => navigate("/")}>
          Back to Dashboard
        </button>
      </main>
    );
  }

  if (metaError === "other") {
    return (
      <main className="center-page" id="main">
        <h1>Couldn&rsquo;t load this document</h1>
        <p role="alert">Check your connection and try again.</p>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    );
  }

  if (deletedMessage) {
    return (
      <main className="center-page" id="main">
        <h1>Document deleted</h1>
        <p role="status">{deletedMessage}</p>
      </main>
    );
  }

  if (!meta || status === "connecting") {
    return (
      <main style={{ display: "flex", justifyContent: "center", padding: "var(--space-xl)" }} id="main">
        <p style={{ color: "var(--text-secondary)" }} role="status">
          Loading…
        </p>
      </main>
    );
  }

  return (
    <div>
      <div className="editor-chrome">
        <header className="editor-header">
          <div className="editor-header-left">
            <button type="button" className="icon-btn" onClick={() => navigate("/")} aria-label="Back to Dashboard">
              <ChevronLeftIcon />
            </button>
            <div className="editor-title-block">
              <h1 className="editor-title">
                <EditableTitle documentId={documentId!} title={meta.title} canEdit={role === "owner"} />
              </h1>
              <ConnectionStatusDot status={status} />
            </div>
          </div>

          <div className="app-header-actions">
            <PresenceAvatarStack collaborators={collaborators} maxVisible={narrow ? 0 : 3} />
            {role === "owner" && (
              <button type="button" className="btn btn-secondary" onClick={() => setShareOpen(true)}>
                Share
              </button>
            )}
            <ExportMenu editor={editor} title={meta.title} />
            <button type="button" className="btn btn-ghost" onClick={() => setHistoryOpen(true)} aria-label="History">
              <ClockIcon />
              <span className="btn-label">History</span>
            </button>
          </div>
        </header>

        <Toolbar editor={editor} disabled={role === "viewer"} />
      </div>

      {toastMessage && (
        <p role="alert" className="field-error" style={{ padding: "var(--space-sm) var(--space-xl) 0" }}>
          {toastMessage}
        </p>
      )}

      {accessNotice && (
        <p role="status" className="notice">
          {accessNotice}{" "}
          <button type="button" className="link-button" onClick={() => setAccessNotice(null)}>
            Dismiss
          </button>
        </p>
      )}

      {restoredNotice && (
        <p role="status" style={{ padding: "var(--space-sm) var(--space-xl) 0", color: "var(--text-secondary)" }}>
          Restored to a previous version.
        </p>
      )}

      <main className="editor-canvas-wrap" id="main">
        <div className="editor-canvas">
          {/* Shown only when printing or saving as PDF: the title is not part of the editor content. */}
          <h1 className="print-title">{meta.title}</h1>
          <EditorContent editor={editor} />
        </div>
      </main>

      <VersionHistoryPanel
        documentId={documentId!}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestored={handleRestored}
        canRestore={role === "owner" || role === "editor"}
      />

      {shareOpen && <ShareModal documentId={documentId!} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
