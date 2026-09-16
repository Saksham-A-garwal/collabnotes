import type { PresenceUser } from "../hooks/useAwarenessStates.js";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

// <PresenceAvatarStack collaborators maxVisible={3} /> — 04-UIUX.md §5.
// Color is always paired with initials/name, never relied on alone (§2.2,
// §10 accessibility: 1.4.1 Use of Color).
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
    <div style={{ display: "flex" }}>
      {visible.map((c, i) => (
        <span
          key={c.clientId}
          className="avatar"
          style={{ background: c.color, marginLeft: i === 0 ? 0 : -8, border: "2px solid var(--bg-chrome)" }}
          title={c.name}
          aria-label={c.name}
        >
          {initials(c.name)}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="avatar"
          style={{ background: "var(--text-secondary)", marginLeft: -8, border: "2px solid var(--bg-chrome)" }}
          aria-label={`${overflow} more collaborator${overflow === 1 ? "" : "s"}`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
