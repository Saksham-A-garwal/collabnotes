import { useEffect, useRef, useState } from "react";
import { COMMENT_BODY_MAX, canComment, type CommentAnchor, type CommentDTO, type CommentThreadDTO, type Role } from "@collabnotes/shared";
import { CheckIcon, CloseIcon } from "./Icons.js";
import { ApiRequestError } from "../lib/apiClient.js";
import type { AnchorRange } from "../lib/commentAnchors.js";
import { relativeTime } from "../lib/relativeTime.js";

export type Draft = { quote: string; anchor: CommentAnchor | null };

type Actions = {
  createThread: (input: { quote: string; anchor: CommentAnchor | null; body: string }) => Promise<CommentThreadDTO>;
  reply: (threadId: string, body: string) => Promise<CommentThreadDTO>;
  setResolved: (threadId: string, resolved: boolean) => Promise<CommentThreadDTO>;
  editComment: (threadId: string, commentId: string, body: string) => Promise<CommentThreadDTO>;
  deleteComment: (threadId: string, commentId: string) => Promise<CommentThreadDTO>;
  deleteThread: (threadId: string) => Promise<void>;
};

const messageOf = (err: unknown) => (err instanceof ApiRequestError ? err.message : "Something went wrong. Try again.");

// One text box used for a new thread, a reply and an edit. Plain text only: what is
// typed is what is shown, never interpreted as markup.
function Composer({
  label,
  submitLabel,
  initial = "",
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  label: string;
  submitLabel: string;
  initial?: string;
  autoFocus?: boolean;
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const empty = value.trim().length === 0;

  async function submit() {
    if (empty || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value.trim());
      setValue("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="comment-composer"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <textarea
        ref={ref}
        className="input comment-input"
        aria-label={label}
        placeholder={label}
        rows={2}
        maxLength={COMMENT_BODY_MAX}
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          } else if (e.key === "Escape" && onCancel) {
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <div className="comment-composer-actions">
        <button type="submit" className="btn btn-primary" disabled={empty || busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function CommentItem({
  thread,
  comment,
  isFirst,
  mine,
  canModerate,
  actions,
  onError,
}: {
  thread: CommentThreadDTO;
  comment: CommentDTO;
  isFirst: boolean;
  mine: boolean;
  canModerate: boolean;
  actions: Actions;
  onError: (message: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  // The opening comment can only go with its whole thread (which is the thread's Delete).
  const canDelete = !isFirst && (mine || canModerate);

  async function remove() {
    onError(null);
    try {
      await actions.deleteComment(thread.id, comment.id);
    } catch (err) {
      onError(messageOf(err));
    }
  }

  return (
    <li className="comment">
      <div className="comment-head">
        <strong>{comment.author.displayName}</strong>
        <span className="meta">
          <time dateTime={comment.createdAt}>{relativeTime(comment.createdAt)}</time>
          {comment.editedAt && " · edited"}
        </span>
      </div>
      {editing ? (
        <Composer
          label="Edit comment"
          submitLabel="Save"
          initial={comment.body}
          autoFocus
          onCancel={() => setEditing(false)}
          onSubmit={async (body) => {
            await actions.editComment(thread.id, comment.id, body);
            setEditing(false);
          }}
        />
      ) : (
        <>
          <p className="comment-body">{comment.body}</p>
          {(mine || canDelete) && (
            <div className="comment-actions">
              {mine && (
                <button type="button" className="link-button" onClick={() => setEditing(true)}>
                  Edit
                </button>
              )}
              {canDelete && (
                <button type="button" className="link-button" onClick={remove}>
                  Delete
                </button>
              )}
            </div>
          )}
        </>
      )}
    </li>
  );
}

function ThreadCard({
  thread,
  active,
  range,
  orphaned,
  role,
  userId,
  actions,
  onActivate,
  onShow,
}: {
  thread: CommentThreadDTO;
  active: boolean;
  range: AnchorRange | null | undefined;
  orphaned: boolean;
  role: Role;
  userId: string;
  actions: Actions;
  onActivate: () => void;
  onShow: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cardRef = useRef<HTMLLIElement>(null);
  const writable = canComment(role);
  const resolved = thread.resolvedAt !== null;
  const canModerate = role === "owner";
  const canDeleteThread = thread.author.id === userId || canModerate;

  // When a thread is opened from the document, bring its card into view.
  useEffect(() => {
    if (active) cardRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <li ref={cardRef} className={active ? "thread is-active" : "thread"} data-thread-id={thread.id} aria-current={active ? "true" : undefined}>
      <div className="thread-quote">
        {range ? (
          <button type="button" className="thread-quote-btn" onClick={onShow} aria-label={`Show in document: ${thread.quote}`}>
            {thread.quote}
          </button>
        ) : (
          <span className="thread-quote-text">{thread.quote}</span>
        )}
        {orphaned && !resolved && <p className="meta">The text this was attached to has changed or been removed.</p>}
      </div>

      <ul className="comment-list" onFocus={onActivate}>
        {thread.comments.map((comment, i) => (
          <CommentItem
            key={comment.id}
            thread={thread}
            comment={comment}
            isFirst={i === 0}
            mine={comment.author.id === userId && writable}
            canModerate={canModerate}
            actions={actions}
            onError={setError}
          />
        ))}
      </ul>

      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}

      {resolved && (
        <p className="meta thread-resolved-note">
          <CheckIcon /> Resolved by {thread.resolvedBy?.displayName ?? "someone"}
        </p>
      )}

      {writable && !resolved && (
        <Composer label="Reply" submitLabel="Reply" onSubmit={async (body) => void (await actions.reply(thread.id, body))} />
      )}

      <div className="thread-actions">
        {writable && (
          <button type="button" className="btn btn-ghost" onClick={() => run(() => actions.setResolved(thread.id, !resolved))}>
            {resolved ? "Reopen" : "Resolve"}
          </button>
        )}
        {canDeleteThread &&
          (confirmDelete ? (
            <span className="thread-confirm">
              Delete this thread?{" "}
              <button type="button" className="link-button danger" onClick={() => run(() => actions.deleteThread(thread.id))}>
                Delete
              </button>{" "}
              <button type="button" className="link-button" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>
              Delete thread
            </button>
          ))}
      </div>
    </li>
  );
}

// <CommentsPanel /> — a side panel beside the document, not a modal: people keep
// reading and typing while it's open. Open threads first; resolved ones tucked away.
export function CommentsPanel({
  threads,
  loaded,
  loadError,
  activeId,
  ranges,
  synced,
  role,
  userId,
  draft,
  actions,
  onActivate,
  onShow,
  onCancelDraft,
  onClose,
}: {
  threads: CommentThreadDTO[];
  loaded: boolean;
  loadError: boolean;
  activeId: string | null;
  ranges: Map<string, AnchorRange | null>;
  synced: boolean;
  role: Role;
  userId: string;
  draft: Draft | null;
  actions: Actions;
  onActivate: (threadId: string) => void;
  onShow: (threadId: string) => void;
  onCancelDraft: () => void;
  onClose: () => void;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const open = threads.filter((t) => t.resolvedAt === null);
  const resolved = threads.filter((t) => t.resolvedAt !== null);
  const writable = canComment(role);

  const card = (thread: CommentThreadDTO) => {
    const range = ranges.get(thread.id);
    return (
      <ThreadCard
        key={thread.id}
        thread={thread}
        active={thread.id === activeId}
        range={range}
        orphaned={synced && thread.anchor !== null && range === null}
        role={role}
        userId={userId}
        actions={actions}
        onActivate={() => onActivate(thread.id)}
        onShow={() => onShow(thread.id)}
      />
    );
  };

  return (
    <aside className="comments-panel" aria-label="Comments">
      <div className="comments-panel-header">
        <strong>Comments</strong>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close comments">
          <CloseIcon />
        </button>
      </div>

      {draft && (
        <section className="thread thread-draft" aria-label="New comment">
          <p className="thread-quote-text">{draft.quote}</p>
          <Composer
            label="Add a comment"
            submitLabel="Comment"
            autoFocus
            onCancel={onCancelDraft}
            onSubmit={async (body) => {
              const thread = await actions.createThread({ quote: draft.quote, anchor: draft.anchor, body });
              onCancelDraft();
              onActivate(thread.id);
            }}
          />
        </section>
      )}

      {loadError && <p className="field-error">Couldn&rsquo;t load comments. They&rsquo;ll appear once you&rsquo;re reconnected.</p>}
      {!loaded && !loadError && <p className="meta">Loading…</p>}

      {loaded && open.length === 0 && !draft && (
        <p className="comments-empty">
          {writable ? "No open comments. Select some text and choose Comment to start a conversation." : "No open comments."}
        </p>
      )}

      <ul className="thread-list">{open.map(card)}</ul>

      {resolved.length > 0 && (
        <>
          <button type="button" className="link-button resolved-toggle" aria-expanded={showResolved} onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? "Hide" : "Show"} resolved ({resolved.length})
          </button>
          {showResolved && <ul className="thread-list">{resolved.map(card)}</ul>}
        </>
      )}
    </aside>
  );
}
