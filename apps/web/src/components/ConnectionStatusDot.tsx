import type { ConnectionStatus } from "../lib/realtimeProvider.js";

const LABELS: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  synced: "All changes saved",
  reconnecting: "Reconnecting…",
  offline: "Offline",
};

const COLORS: Record<ConnectionStatus, string> = {
  connecting: "var(--text-secondary)",
  synced: "#3DAE5C",
  reconnecting: "var(--accent)",
  offline: "var(--danger)",
};

export function ConnectionStatusDot({ status }: { status: ConnectionStatus }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-xs)",
        fontSize: "var(--text-xs)",
        color: "var(--text-secondary)",
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: COLORS[status],
          display: "inline-block",
        }}
      />
      {LABELS[status]}
    </span>
  );
}
