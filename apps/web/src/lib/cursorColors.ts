// Fixed collaborator palette — 04-UIUX.md §2.2 ("e.g." hues). #E8559F replaces
// the sample #E03D8F: neither black nor white text reached 4.5:1 on that pink
// (scripts/contrast-check.mjs). Every hue below has *some* label color that
// clears WCAG 1.4.3, and readableTextColor() picks it.
export const CURSOR_COLORS = [
  "#E0573D",
  "#3D8BE0",
  "#3DAE5C",
  "#B23DE0",
  "#E0A73D",
  "#3DBEB8",
  "#E8559F",
  "#7A8C3D",
];

export function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length]!;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

// Whichever of near-black / white has the higher contrast against `hex`.
export function readableTextColor(hex: string): string {
  const l = luminance(hex);
  const whiteContrast = 1.05 / (l + 0.05);
  const darkContrast = (l + 0.05) / (luminance("#1A1A1A") + 0.05);
  return whiteContrast >= darkContrast ? "#FFFFFF" : "#1A1A1A";
}

// Same DOM as @tiptap/extension-collaboration-cursor's default renderer, plus
// a label color chosen for contrast instead of a hardcoded white.
export function renderCursor(user: { name: string; color: string }): HTMLElement {
  const cursor = document.createElement("span");
  cursor.classList.add("collaboration-cursor__caret");
  cursor.setAttribute("style", `border-color: ${user.color}`);

  const label = document.createElement("div");
  label.classList.add("collaboration-cursor__label");
  label.setAttribute("style", `background-color: ${user.color}; color: ${readableTextColor(user.color)}`);
  label.insertBefore(document.createTextNode(user.name), null);

  cursor.insertBefore(label, null);
  return cursor;
}
