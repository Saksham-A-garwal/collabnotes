import { useEffect, useRef, useState } from "react";
import type { SnapshotSummary } from "@collabnotes/shared";
import { useDialogFocus } from "../hooks/useDialogFocus.js";
import { ApiRequestError } from "../lib/apiClient.js";
import { documentsApi } from "../lib/documentsApi.js";
import { relativeTime } from "../lib/relativeTime.js";

function triggeredByLabel(snapshot: SnapshotSummary): string {
  return snapshot.triggeredBy === "auto" ? "Auto-saved" : `Saved by ${snapshot.triggeredBy.displayName}`;
}

// <VersionHistoryPanel documentId open onClose onRestored /> — 04-UIUX.md
// §3.5/§5: right-side slide-over, newest first, a lightweight inline
// confirm per row rather than a heavy modal (restoring isn't permanently
// destructive — it creates a new snapshot, SRS FR-23b).
function VersionHistoryPanelContent({
  documentId,
  onClose,
  onRestored,
  canRestore,
}: {
  documentId: string;
  onClose: () => void;
  onRestored: () => void;
  canRestore: boolean;
}) {
  const panelRef = useRef<HTMLElement>(null);
  useDialogFocus(panelRef, { trap: false });
  const [snapshots, setSnapshots] = useState<SnapshotSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    documentsApi
      .listSnapshots(documentId)
      .then(({ snapshots }) => setSnapshots(snapshots))
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.message : "Couldn't load version history.");
      });
  }, [documentId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleRestore(snapshotId: string) {
    setRestoringId(snapshotId);
    try {
      await documentsApi.restoreSnapshot(documentId, snapshotId);
      setConfirmingId(null);
      onRestored();
      const { snapshots } = await documentsApi.listSnapshots(documentId);
      setSnapshots(snapshots);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't restore this version.");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <aside ref={panelRef} tabIndex={-1} className="history-panel" role="dialog" aria-label="Version history">
      <div className="history-panel-header">
        <strong>Version history</strong>
        <button type="button" className="link-button" onClick={onClose} aria-label="Close version history">
          Close
        </button>
      </div>

      {error && <p className="field-error">{error}</p>}

      {snapshots === null && !error && <p style={{ color: "var(--text-secondary)" }}>Loading…</p>}

      {snapshots !== null && snapshots.length === 0 && (
        <p style={{ color: "var(--text-secondary)" }}>No versions yet.</p>
      )}

      <ul className="history-list">
        {snapshots?.map((snapshot) => (
          <li key={snapshot.id} className="history-item">
            <div>
              <div>{relativeTime(snapshot.createdAt)}</div>
              <div className="meta">{triggeredByLabel(snapshot)}</div>
            </div>
            {canRestore &&
              (confirmingId === snapshot.id ? (
                <div className="history-confirm">
                  <span>Restore this version? Current content will be replaced.</span>
                  <div style={{ display: "flex", gap: "var(--space-xs)" }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={restoringId === snapshot.id}
                      onClick={() => handleRestore(snapshot.id)}
                    >
                      {restoringId === snapshot.id ? "Restoring…" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setConfirmingId(null)}
                      disabled={restoringId === snapshot.id}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setConfirmingId(snapshot.id)}
                  aria-label={`Restore version from ${relativeTime(snapshot.createdAt)}, ${triggeredByLabel(snapshot)}`}
                >
                  Restore
                </button>
              ))}
          </li>
        ))}
      </ul>
    </aside>
  );
}

// Content only mounts while open, so its focus-in / focus-restore effect
// (useDialogFocus) fires exactly when the dialog appears and disappears.
export function VersionHistoryPanel({
  open,
  ...rest
}: {
  documentId: string;
  open: boolean;
  onClose: () => void;
  onRestored: () => void;
  canRestore: boolean;
}) {
  return open ? <VersionHistoryPanelContent {...rest} /> : null;
}
