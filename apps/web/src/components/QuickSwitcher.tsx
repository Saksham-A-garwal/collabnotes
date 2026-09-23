import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { DocumentSummary, SearchResult } from "@collabnotes/shared";
import { useAuth } from "../hooks/useAuth.js";
import { useDialogFocus } from "../hooks/useDialogFocus.js";
import { useDocumentSearch } from "../hooks/useDocumentSearch.js";
import { documentsApi } from "../lib/documentsApi.js";
import { SearchIcon } from "./Icons.js";
import { SearchHit } from "./SearchHit.js";

const OPEN_EVENT = "collabnotes:open-search";

export const openQuickSwitcher = (): void => {
  window.dispatchEvent(new Event(OPEN_EVENT));
};

export const shortcutLabel = (): string => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K");

export function QuickSwitcher() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setOpen(false);
      return;
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [isAuthenticated]);

  if (!open || !isAuthenticated) return null;
  return <SwitcherDialog onClose={() => setOpen(false)} />;
}

function asResult(doc: DocumentSummary): SearchResult {
  return { id: doc.id, title: doc.title, role: doc.role, updatedAt: doc.updatedAt, snippet: null };
}

function SwitcherDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, { trap: true });

  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const search = useDocumentSearch(query);

  useEffect(() => {
    documentsApi
      .list()
      .then(({ documents }) => setRecent(documents.slice(0, 6).map(asResult)))
      .catch(() => undefined);
  }, []);

  const items = useMemo(() => (search.active ? search.results : recent), [search.active, search.results, recent]);
  useEffect(() => setActive(0), [items]);

  function open(result: SearchResult | undefined) {
    if (!result) return;
    onClose();
    navigate(`/documents/${result.id}`);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      open(items[active]);
    }
  }

  const activeId = items[active] ? `qs-option-${items[active]!.id}` : undefined;
  const heading = search.active ? "Results" : "Recent";
  const status = search.loading
    ? "Searching…"
    : search.error
      ? search.error
      : search.active
        ? `${items.length} ${items.length === 1 ? "result" : "results"}`
        : "";

  return (
    <div className="modal-backdrop qs-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="qs"
        role="dialog"
        aria-modal="true"
        aria-label="Search documents"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="qs-input-row">
          <SearchIcon />
          <input
            className="qs-input"
            type="text"
            placeholder="Search titles and contents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            role="combobox"
            aria-expanded="true"
            aria-controls="qs-list"
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-label="Search documents"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <p role="status" className="sr-only">
          {status}
        </p>

        <div className="qs-body">
          <p className="qs-heading" aria-hidden="true">
            {heading}
            {search.loading && <span className="qs-loading"> · Searching…</span>}
          </p>
          {search.error && (
            <p role="alert" className="field-error" style={{ padding: "0 var(--space-md)" }}>
              {search.error}
            </p>
          )}
          {!search.error && items.length === 0 && !search.loading && (
            <p className="qs-empty">{search.active ? `No documents match “${query.trim()}”.` : "No documents yet."}</p>
          )}
          <ul id="qs-list" role="listbox" aria-label={heading} className="qs-list">
            {items.map((result, i) => (
              <li
                key={result.id}
                id={`qs-option-${result.id}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "qs-option active" : "qs-option"}
                onMouseMove={() => setActive(i)}
                onClick={() => open(result)}
              >
                <SearchHit result={result} />
              </li>
            ))}
          </ul>
        </div>

        <p className="qs-foot" aria-hidden="true">
          <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> to move · <kbd className="kbd">Enter</kbd> to open · <kbd className="kbd">Esc</kbd> to close
        </p>
      </div>
    </div>
  );
}
