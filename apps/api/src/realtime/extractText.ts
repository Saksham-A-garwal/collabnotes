import * as Y from "yjs";

export const MAX_SEARCH_TEXT = 200_000;

const LINE_BLOCKS = new Set(["paragraph", "heading", "codeBlock", "horizontalRule"]);

function collect(node: Y.XmlElement | Y.XmlFragment | Y.XmlText | Y.XmlHook, out: string[]): void {
  if (node instanceof Y.XmlText) {
    for (const run of node.toDelta() as { insert?: unknown }[]) {
      if (typeof run.insert === "string") out.push(run.insert);
    }
    return;
  }
  if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
    for (const child of node.toArray()) collect(child, out);
    if (node instanceof Y.XmlElement && (LINE_BLOCKS.has(node.nodeName) || node.nodeName === "hardBreak")) {
      out.push("\n");
    }
  }
}

function clean(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    out += (code < 0x20 && code !== 0x0a && code !== 0x09) || code === 0x7f ? " " : ch;
  }
  return out
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractPlainText(doc: Y.Doc): string {
  const parts: string[] = [];
  collect(doc.getXmlFragment("default"), parts);
  const text = clean(parts.join(""));
  return text.length > MAX_SEARCH_TEXT ? text.slice(0, MAX_SEARCH_TEXT) : text;
}
