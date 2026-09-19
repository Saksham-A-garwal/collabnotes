import { describe, expect, it } from "vitest";
import { CURSOR_COLORS, colorForUser, readableTextColor } from "./cursorColors.js";

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("collaborator colors (WCAG 1.4.3 / 1.4.1)", () => {
  it("every palette color has a label color that reaches 4.5:1", () => {
    for (const color of CURSOR_COLORS) {
      expect(contrast(readableTextColor(color), color), color).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("assigns the same color to the same user every time", () => {
    expect(colorForUser("user-123")).toBe(colorForUser("user-123"));
    expect(CURSOR_COLORS).toContain(colorForUser("someone-else"));
  });

  it("spreads different users across the palette", () => {
    const used = new Set(Array.from({ length: 200 }, (_, i) => colorForUser(`user-${i}`)));
    expect(used.size).toBe(CURSOR_COLORS.length);
  });
});
