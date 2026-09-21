import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { DocumentAccessEntry, Role, ShareLink } from "@collabnotes/shared";
import { CloseIcon } from "./Icons.js";
import { useAuth } from "../hooks/useAuth.js";
import { useDialogFocus } from "../hooks/useDialogFocus.js";
import { ApiRequestError } from "../lib/apiClient.js";
import { sharingApi } from "../lib/sharingApi.js";

type ShareRole = Exclude<Role, "owner">;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

// <ShareModal documentId currentCollaborators onInvite onGenerateLink
// onRevoke /> — 04-UIUX.md §3.4: invite-by-email + share-link sections,
// collaborator list below both, Owner row fixed with no remove action.
export function ShareModal({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const { user } = useAuth();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, { trap: true });
  const [collaborators, setCollaborators] = useState<DocumentAccessEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ShareRole>("editor");
  const [inviting, setInviting] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);

  const [link, setLink] = useState<ShareLink | null>(null);
  const [linkRole, setLinkRole] = useState<ShareRole>("viewer");
  const [linkBusy, setLinkBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadCollaborators = useCallback(async () => {
    try {
      const { collaborators } = await sharingApi.listAccess(documentId);
      setCollaborators(collaborators);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't load collaborators.");
    }
  }, [documentId]);

  useEffect(() => {
    loadCollaborators();
  }, [loadCollaborators]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    try {
      await sharingApi.invite(documentId, inviteEmail, inviteRole);
      setInviteEmail("");
      setInviteSent(true);
      setTimeout(() => setInviteSent(false), 3000);
      await loadCollaborators();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't send invite.");
    } finally {
      setInviting(false);
    }
  }

  async function handleCreateLink() {
    setLinkBusy(true);
    setError(null);
    try {
      setLink(await sharingApi.createLink(documentId, linkRole));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't create a share link.");
    } finally {
      setLinkBusy(false);
    }
  }

  async function handleRevokeLink() {
    if (!link) return;
    setLinkBusy(true);
    try {
      await sharingApi.revokeLink(documentId, link.token);
      setLink(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't revoke the link.");
    } finally {
      setLinkBusy(false);
    }
  }

  async function handleCopyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — the link text is still selectable/visible.
    }
  }

  async function handleRoleChange(entry: DocumentAccessEntry, role: ShareRole) {
    setError(null);
    try {
      await sharingApi.invite(documentId, entry.email, role);
      await loadCollaborators();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't change role.");
    }
  }

  async function handleRemove(entry: DocumentAccessEntry) {
    setError(null);
    try {
      if (entry.userId) {
        await sharingApi.removeAccess(documentId, entry.userId);
      } else {
        await sharingApi.cancelPendingInvite(documentId, entry.email);
      }
      await loadCollaborators();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't remove.");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Share document"
      >
        <div className="modal-header">
          <strong>Share document</strong>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close share dialog">
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={handleInvite} className="share-invite-row">
          <input
            className="input"
            type="email"
            placeholder="Email address"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
            style={{ flex: 1 }}
            aria-label="Invite by email"
          />
          <select
            className="toolbar-select"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as ShareRole)}
            aria-label="Role for invite"
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          <button type="submit" className="btn btn-primary" disabled={inviting || !inviteEmail}>
            {inviting ? "Sending…" : "Send"}
          </button>
        </form>
        {inviteSent && (
          <p role="status" style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", margin: "var(--space-xs) 0 0" }}>
            Invite sent.
          </p>
        )}

        <div className="share-link-section">
          <strong style={{ fontSize: "var(--text-sm)" }}>Share link</strong>
          {link ? (
            <div className="share-link-row">
              <input
                className="input"
                readOnly
                value={link.url}
                style={{ flex: 1 }}
                onFocus={(e) => e.target.select()}
                aria-label="Share link URL"
              />
              <button type="button" className="btn btn-secondary" onClick={handleCopyLink}>
                {copied ? "Copied!" : "Copy"}
              </button>
              <button type="button" className="btn btn-danger" onClick={handleRevokeLink} disabled={linkBusy}>
                Revoke
              </button>
            </div>
          ) : (
            <div className="share-link-row">
              <select
                className="toolbar-select"
                value={linkRole}
                onChange={(e) => setLinkRole(e.target.value as ShareRole)}
                aria-label="Role for share link"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <button type="button" className="btn btn-secondary" onClick={handleCreateLink} disabled={linkBusy}>
                {linkBusy ? "Creating…" : "Create link"}
              </button>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}

        <div>
          <strong style={{ fontSize: "var(--text-sm)" }}>Collaborators</strong>
          <ul className="collaborator-list">
            {user && (
              <li className="collaborator-row">
                <span className="avatar" style={{ background: "var(--accent)" }}>
                  {initials(user.displayName)}
                </span>
                <div style={{ flex: 1 }}>
                  <div>{user.displayName}</div>
                  <div className="meta">{user.email}</div>
                </div>
                <span className="meta">Owner</span>
              </li>
            )}
            {collaborators?.map((c) => (
              <li key={c.userId ?? c.email} className="collaborator-row">
                <span className="avatar" style={{ background: "var(--text-secondary)" }}>
                  {c.displayName ? initials(c.displayName) : "?"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>
                    {c.displayName ?? c.email}
                    {c.pending && " (pending)"}
                  </div>
                  <div className="meta">{c.email}</div>
                </div>
                <select
                  className="toolbar-select"
                  value={c.role}
                  onChange={(e) => handleRoleChange(c, e.target.value as ShareRole)}
                  aria-label={`Role for ${c.email}`}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button type="button" className="btn btn-danger" onClick={() => handleRemove(c)} aria-label={`Remove ${c.email}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
