import type { PresenceUser } from "../hooks/useAwarenessStates.js";
import { readableTextColor } from "../lib/cursorColors.js";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function PresenceAvatarStack({
  collaborators,
  maxVisible = 3,
}: {
  collaborators: PresenceUser[];
  maxVisible?: number;
}) {
  const visible = collaborators.slice(0, maxVisible);
  const overflow = collaborators.length - visible.length;

  return (
    <div style={{ display: "flex" }} role="group" aria-label={`${collaborators.length} other collaborator${collaborators.length === 1 ? "" : "s"} here`}>
      {visible.map((c, i) => (
        <span
          key={c.clientId}
          className="avatar"
          style={{
            background: c.color,
            color: readableTextColor(c.color),
            marginLeft: i === 0 ? 0 : -8,
            border: "2px solid var(--bg-chrome)",
          }}
          title={c.name}
          aria-label={c.name}
        >
          {initials(c.name)}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="avatar"
          style={{
            background: "var(--text-secondary)",
            color: "var(--bg-canvas)",
            marginLeft: visible.length === 0 ? 0 : -8,
            border: "2px solid var(--bg-chrome)",
          }}
          aria-label={`${overflow} more collaborator${overflow === 1 ? "" : "s"}`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
