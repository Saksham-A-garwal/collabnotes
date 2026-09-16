import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DocumentSummary } from "@collabnotes/shared";
import { useAuth } from "../hooks/useAuth.js";
import { ApiRequestError } from "../lib/apiClient.js";
import { documentsApi } from "../lib/documentsApi.js";
import { relativeTime } from "../lib/relativeTime.js";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function DocumentCard({
  doc,
  onOpen,
  onDelete,
}: {
  doc: DocumentSummary;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className="document-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
    >
      {doc.role === "owner" && (
        <button
          type="button"
          className="delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (confirming) {
              onDelete();
            } else {
              setConfirming(true);
            }
          }}
          onBlur={() => setConfirming(false)}
          aria-label={confirming ? `Confirm delete ${doc.title}` : `Delete ${doc.title}`}
        >
          {confirming ? "Confirm?" : "Delete"}
        </button>
      )}
      <span className="title">{doc.title}</span>
      <span className="meta">
        Updated {relativeTime(doc.updatedAt)}
        {doc.role !== "owner" && ` · ${doc.role}`}
      </span>
    </div>
  );
}

// Dashboard: create/list/delete documents, per 04-UIUX.md §3.2.
export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  async function loadDocuments() {
    try {
      const { documents: docs } = await documentsApi.list();
      setDocuments(docs);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't load documents — retry.");
    }
  }

  useEffect(() => {
    loadDocuments();
  }, []);

  const filtered = useMemo(() => {
    if (!documents) return [];
    const q = query.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) => d.title.toLowerCase().includes(q));
  }, [documents, query]);

  async function handleCreate() {
    setCreating(true);
    try {
      const { document } = await documentsApi.create();
      navigate(`/documents/${document.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't create the document.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    const previous = documents;
    setDocuments((docs) => docs?.filter((d) => d.id !== id) ?? null);
    try {
      await documentsApi.remove(id);
    } catch (err) {
      setDocuments(previous ?? null);
      setError(err instanceof ApiRequestError ? err.message : "Couldn't delete the document.");
    }
  }

  return (
    <div>
      <header className="dashboard-header">
        <strong style={{ fontSize: "var(--text-lg)" }}>CollabNotes</strong>
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            type="button"
            className="avatar"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Account menu"
            aria-expanded={menuOpen}
          >
            {user ? initials(user.displayName) : "?"}
          </button>
          {menuOpen && (
            <div
              className="card"
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + var(--space-xs))",
                padding: "var(--space-sm)",
                zIndex: 1,
                minWidth: 160,
              }}
            >
              <p style={{ margin: "0 0 var(--space-sm)", fontSize: "var(--text-sm)" }}>
                {user?.displayName}
              </p>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => logout()}>
                Log out
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="dashboard-toolbar">
        <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={creating}>
          {creating ? "Creating…" : "New document"}
        </button>
        <input
          className="input"
          type="search"
          placeholder="Search documents"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 280 }}
          aria-label="Search documents by title"
        />
      </div>

      {error && (
        <p role="alert" className="field-error" style={{ padding: "0 var(--space-xl)" }}>
          {error}{" "}
          <button type="button" className="link-button" onClick={loadDocuments}>
            Retry
          </button>
        </p>
      )}

      {documents === null && !error && (
        <div className="document-grid" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="document-card" style={{ opacity: 0.5 }}>
              <span className="title">Loading…</span>
            </div>
          ))}
        </div>
      )}

      {documents !== null && filtered.length === 0 && (
        <div className="empty-state">
          <p>{query ? "No documents match your search." : "Create your first document"}</p>
          {!query && (
            <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={creating}>
              New document
            </button>
          )}
        </div>
      )}

      {documents !== null && filtered.length > 0 && (
        <div className="document-grid">
          {filtered.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onOpen={() => navigate(`/documents/${doc.id}`)}
              onDelete={() => handleDelete(doc.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
