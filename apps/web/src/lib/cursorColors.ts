// Fixed, WCAG-AA-contrast-checked palette — source of truth: 04-UIUX.md §2.2.
export const CURSOR_COLORS = [
  "#E0573D",
  "#3D8BE0",
  "#3DAE5C",
  "#B23DE0",
  "#E0A73D",
  "#3DBEB8",
  "#E03D8F",
  "#7A8C3D",
];

export function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length]!;
}
