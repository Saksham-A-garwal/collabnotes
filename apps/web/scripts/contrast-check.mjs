// WCAG 2.2 SC 1.4.3 contrast check for the design tokens in src/index.css
// (04-UIUX.md §2.2, §10). Run: node scripts/contrast-check.mjs
// Exits non-zero if any required pair falls below its threshold.

const lin = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const themes = {
  light: {
    canvas: "#FFFFFF", chrome: "#F7F7F5", text: "#1A1A1A", muted: "#6B6B68",
    accent: "#3866DA", onAccent: "#FFFFFF", danger: "#D0392C",
  },
  dark: {
    canvas: "#1A1A1A", chrome: "#232323", text: "#F0F0EE", muted: "#A0A09C",
    accent: "#6D93F0", onAccent: "#1A1A1A", danger: "#E5645A",
  },
};

const cursorColors = ["#E0573D", "#3D8BE0", "#3DAE5C", "#B23DE0", "#E0A73D", "#3DBEB8", "#E8559F", "#7A8C3D"];

let failures = 0;
const check = (label, fg, bg, min) => {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.toFixed(2).padStart(5)}:1 (min ${min})  ${label}  ${fg} on ${bg}`);
};

for (const [name, t] of Object.entries(themes)) {
  check(`${name}: body text`, t.text, t.canvas, 4.5);
  check(`${name}: body text on chrome`, t.text, t.chrome, 4.5);
  check(`${name}: muted text on canvas`, t.muted, t.canvas, 4.5);
  check(`${name}: muted text on chrome`, t.muted, t.chrome, 4.5);
  check(`${name}: accent link on canvas`, t.accent, t.canvas, 4.5);
  check(`${name}: accent link on chrome`, t.accent, t.chrome, 4.5);
  check(`${name}: label on accent button`, t.onAccent, t.accent, 4.5);
  check(`${name}: danger text on canvas`, t.danger, t.canvas, 4.5);
  check(`${name}: danger text on chrome`, t.danger, t.chrome, 4.5);
}

// Collaborator colors carry a text label/initials (cursor tag, avatar chip).
// Pick whichever of black/white text gives the higher contrast, and require
// it to clear 4.5:1 — that's what the UI actually renders.
for (const c of cursorColors) {
  const white = ratio("#FFFFFF", c);
  const dark = ratio("#1A1A1A", c);
  const best = Math.max(white, dark);
  const pick = white >= dark ? "#FFFFFF" : "#1A1A1A";
  check(`cursor label ${pick} on ${c}`, pick, c, 4.5);
  void best;
}

if (failures) {
  console.error(`\n${failures} pair(s) below threshold`);
  process.exit(1);
}
console.log("\nAll pairs pass.");
