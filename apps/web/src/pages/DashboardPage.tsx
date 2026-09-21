import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DocumentSummary } from "@collabnotes/shared";
import { Brand } from "../components/BrandMark.js";
import { EmptyPagesArt, FileIcon, LogOutIcon, PlusIcon, SearchIcon } from "../components/Icons.js";
import { useAuth } from "../hooks/useAuth.js";
import { useDocumentSearch } from "../hooks/useDocumentSearch.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { shortcutLabel } from "../components/QuickSwitcher.js";
import { SearchHit } from "../components/SearchHit.js";
import { ApiRequestError } from "../lib/apiClient.js";
import { documentsApi } from "../lib/documentsApi.js";
import { relativeTime } from "../lib/relativeTime.js";
import { loadEditorPage } from "./editorPageLoader.js";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function DocumentRow({
  doc,
  onOpen,
  onDelete,
}: {
  doc: DocumentSummary;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  // Open and Delete are sibling buttons, not one interactive element nested
  // inside another (invalid for assistive tech, and a stray Enter on the
  // delete button used to bubble into "open").
  return (
    <div className="doc-row">
      <button type="button" className="doc-open" onClick={onOpen}>
        <FileIcon />
        <span className="doc-title">{doc.title}</span>
        <span className="doc-meta">
          {doc.role !== "owner" && <span className="badge">{doc.role}</span>}
          <span className="doc-updated">Updated {relativeTime(doc.updatedAt)}</span>
        </span>
      </button>
      {doc.role === "owner" && (
        <button
          type="button"
          className="delete-btn"
          data-confirming={confirming}
          onClick={() => {
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
    </div>
  );
}

// Dashboard: create/list/delete documents, per 04-UIUX.md §3.2.
export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  useDocumentTitle("Documents");

  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // The editor is its own chunk (see editorPageLoader.ts). Nearly everyone who
  // reaches the dashboard opens a document next, so fetch it in the background
  // once the dashboard has settled — off the critical path, ready on click.
  useEffect(() => {
    const t = window.setTimeout(() => void loadEditorPage(), 1000);
    return () => window.clearTimeout(t);
  }, []);

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

  // Two characters or more searches the *contents* of your documents on the server;
  // a single character just narrows the list on screen by title.
  const search = useDocumentSearch(query);

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

  const firstName = user?.displayName.trim().split(/\s+/)[0] ?? "";

  return (
    <div>
      <header className="app-header">
        <Brand />
        <div className="app-header-actions">
          <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            <PlusIcon />
            {creating ? "Creating…" : "New document"}
          </button>
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              type="button"
              className="avatar"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Account menu"
              aria-expanded={menuOpen}
              aria-haspopup="true"
            >
              {user ? initials(user.displayName) : "?"}
            </button>
            {menuOpen && (
              <div className="popover" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 6 }}>
                <div style={{ padding: "8px 10px 10px" }}>
                  <p style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{user?.displayName}</p>
                  <p style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>{user?.email}</p>
                </div>
                <button type="button" className="popover-menu-item" onClick={() => logout()}>
                  <LogOutIcon />
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="page" id="main">
        <h1 className="page-title">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="page-sub">Pick up where you left off, or start something new.</p>

        <div className="page-toolbar">
          <div className="search">
            <SearchIcon />
            <input
              className="input"
              type="search"
              placeholder={`Search documents (${shortcutLabel()})`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search your documents"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="field-error" style={{ marginBottom: "var(--space-md)" }}>
            {error}{" "}
            <button type="button" className="link-button" onClick={loadDocuments}>
              Retry
            </button>
          </p>
        )}

        {search.active && (
          <section aria-labelledby="search-heading">
            <h2 id="search-heading" className="section-label">
              Results{search.loading ? " · Searching…" : ""}
            </h2>
            {search.error && (
              <p role="alert" className="field-error" style={{ padding: "var(--space-sm) 12px" }}>
                {search.error}
              </p>
            )}
            {!search.loading && !search.error && search.results.length === 0 && (
              <div className="empty-state">
                <EmptyPagesArt />
                <h3>No matches</h3>
                <p>No documents match &ldquo;{query.trim()}&rdquo;. Searches look at titles and contents.</p>
              </div>
            )}
            <div className="doc-list">
              {search.results.map((result) => (
                <div key={result.id} className="doc-row">
                  <button type="button" className="doc-open search-hit" onClick={() => navigate(`/documents/${result.id}`)}>
                    <SearchHit result={result} />
                  </button>
                </div>
              ))}
            </div>
            <p role="status" className="sr-only">
              {search.loading ? "Searching" : `${search.results.length} ${search.results.length === 1 ? "result" : "results"}`}
            </p>
          </section>
        )}

        {!search.active && documents === null && !error && (
          <div aria-busy="true" aria-label="Loading documents">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton doc-skeleton" />
            ))}
          </div>
        )}

        {!search.active && documents !== null && filtered.length === 0 && (
          <div className="empty-state">
            <EmptyPagesArt />
            <h2>{query ? "No matches" : "No documents yet"}</h2>
            <p>{query ? "No documents match your search." : "Create your first document and invite people to write with you."}</p>
            {!query && (
              <button type="button" className="btn btn-primary btn-lg" onClick={handleCreate} disabled={creating} style={{ marginTop: "var(--space-sm)" }}>
                <PlusIcon />
                New document
              </button>
            )}
          </div>
        )}

        {!search.active && documents !== null && filtered.length > 0 && (
          <section aria-labelledby="docs-heading">
            <h2 id="docs-heading" className="section-label">
              {query ? "Results" : "Your documents"}
            </h2>
            <div className="doc-list">
              {filtered.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  onOpen={() => navigate(`/documents/${doc.id}`)}
                  onDelete={() => handleDelete(doc.id)}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
