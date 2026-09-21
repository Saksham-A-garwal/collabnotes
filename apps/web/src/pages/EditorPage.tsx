import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { canComment, canEditContent, type DocumentDetail, type Role } from "@collabnotes/shared";
import { CommentsPanel, type Draft } from "../components/CommentsPanel.js";
import { ChevronLeftIcon, ClockIcon, CommentIcon, SearchIcon } from "../components/Icons.js";
import { openQuickSwitcher, shortcutLabel } from "../components/QuickSwitcher.js";
import { ConnectionStatusDot } from "../components/ConnectionStatusDot.js";
import { ExportMenu } from "../components/ExportMenu.js";
import { PresenceAvatarStack } from "../components/PresenceAvatarStack.js";
import { SelectionCommentButton } from "../components/SelectionCommentButton.js";
import { ShareModal } from "../components/ShareModal.js";
import { Toolbar } from "../components/Toolbar.js";
import { VersionHistoryPanel } from "../components/VersionHistoryPanel.js";
import { useAuth } from "../hooks/useAuth.js";
import { useAwarenessStates } from "../hooks/useAwarenessStates.js";
import { useComments } from "../hooks/useComments.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { useRealtimeDocument } from "../hooks/useRealtimeDocument.js";
import { ApiRequestError } from "../lib/apiClient.js";
import { colorForUser, renderCursor } from "../lib/cursorColors.js";
import {
  anchorFromSelection,
  CommentAnchors,
  createAnchorController,
  refreshAnchors,
  scrollToAnchor,
  type AnchorRange,
} from "../lib/commentAnchors.js";
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
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [ranges, setRanges] = useState<Map<string, AnchorRange | null>>(new Map());
  const [anchorController] = useState(createAnchorController);
  const chromeRef = useRef<HTMLDivElement>(null);
  const narrow = useMediaQuery("(max-width: 480px)");
  useDocumentTitle(meta?.title ?? "");

  const { doc, provider, status, role, deletedMessage, toastMessage } = useRealtimeDocument(
    documentId!,
  );
  const collaborators = useAwarenessStates(provider?.awareness ?? null);
  const comments = useComments(documentId!, provider, status);

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
            CommentAnchors.configure({ getController: () => anchorController }),
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

  // Only owners and editors change the text. Commenters read and comment, viewers just read.
  const canEdit = role !== null && canEditContent(role);
  const canAddComments = role !== null && canComment(role);

  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [editor, canEdit]);

  useEffect(() => {
    if (role && previousRole.current && previousRole.current !== role) {
      setAccessNotice(
        role === "viewer"
          ? "Your access changed to view-only."
          : role === "commenter"
            ? "Your access changed to comment-only."
            : `Your access changed to ${role}.`,
      );
    }
    if (role) previousRole.current = role;
  }, [role]);

  // Highlights follow the thread list and the active thread; clicking one opens its card.
  useEffect(() => {
    anchorController.onActivate = (id) => {
      setActiveThreadId(id);
      setCommentsOpen(true);
    };
    anchorController.onRanges = setRanges;
  }, [anchorController]);

  useEffect(() => {
    anchorController.threads = comments.threads.map((t) => ({ id: t.id, anchor: t.anchor, resolved: t.resolvedAt !== null }));
    anchorController.activeId = activeThreadId;
    refreshAnchors(editor);
  }, [anchorController, comments.threads, activeThreadId, editor]);

  // Losing the right to comment closes any half-written comment.
  useEffect(() => {
    if (!canAddComments) setDraft(null);
  }, [canAddComments]);

  function startComment() {
    if (!editor || !canAddComments) return;
    const selected = anchorFromSelection(editor.state);
    if (!selected) return;
    setDraft({ quote: selected.quote, anchor: selected.anchor });
    setCommentsOpen(true);
  }

  // Ctrl/Cmd+Alt+M: comment on the selection, for people not using a pointer.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === "KeyM") {
        e.preventDefault();
        startComment();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  // The comments panel sits below the sticky header, whose height changes with the
  // toolbar wrapping; measure it rather than guess.
  useEffect(() => {
    function measure() {
      const bottom = chromeRef.current?.getBoundingClientRect().bottom;
      if (bottom) document.documentElement.style.setProperty("--chrome-bottom", `${Math.round(bottom)}px`);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [commentsOpen, canEdit, meta, status]);

  const openThreadCount = comments.threads.filter((t) => t.resolvedAt === null).length;

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
      <div className="editor-chrome" ref={chromeRef}>
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
            <button type="button" className="btn btn-ghost" onClick={openQuickSwitcher} aria-label="Search documents" title={`Search documents (${shortcutLabel()})`}>
              <SearchIcon />
              <span className="btn-label">Search</span>
            </button>
            <ExportMenu editor={editor} title={meta.title} />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setCommentsOpen((v) => !v)}
              aria-pressed={commentsOpen}
              aria-label={openThreadCount > 0 ? `Comments, ${openThreadCount} open` : "Comments"}
            >
              <CommentIcon />
              <span className="btn-label">Comments</span>
              {openThreadCount > 0 && <span className="count-badge">{openThreadCount}</span>}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setHistoryOpen(true)} aria-label="History">
              <ClockIcon />
              <span className="btn-label">History</span>
            </button>
          </div>
        </header>

        <Toolbar editor={editor} disabled={!canEdit} />
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

      <main className={commentsOpen ? "editor-canvas-wrap with-comments" : "editor-canvas-wrap"} id="main">
        <div className="editor-canvas">
          {/* Shown only when printing or saving as PDF: the title is not part of the editor content. */}
          <h1 className="print-title">{meta.title}</h1>
          <EditorContent editor={editor} />
        </div>
      </main>

      {canAddComments && !draft && <SelectionCommentButton editor={editor} onComment={startComment} />}

      {commentsOpen && role && user && (
        <CommentsPanel
          threads={comments.threads}
          loaded={comments.loaded}
          loadError={comments.loadError}
          activeId={activeThreadId}
          ranges={ranges}
          synced={status === "synced"}
          role={role}
          userId={user.id}
          draft={draft}
          actions={comments}
          onActivate={setActiveThreadId}
          onShow={(id) => {
            setActiveThreadId(id);
            scrollToAnchor(editor, anchorController, id);
          }}
          onCancelDraft={() => {
            setDraft(null);
            // Drop the selection too, so the floating button doesn't linger over finished work.
            if (editor && !editor.isDestroyed) editor.commands.setTextSelection(editor.state.selection.to);
          }}
          onClose={() => {
            setCommentsOpen(false);
            setDraft(null);
          }}
        />
      )}

      <VersionHistoryPanel
        documentId={documentId!}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestored={handleRestored}
        canRestore={canEdit}
      />

      {shareOpen && <ShareModal documentId={documentId!} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
