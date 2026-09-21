import * as Y from "yjs";

// A document is stored as a Yjs tree, not text: the editor keeps its content in
// an XML fragment named "default" (paragraphs, headings, list items, ...) whose
// leaves are XmlText runs. To search it, that tree is flattened to plain text.
//
// Line breaks are kept between blocks so a snippet reads naturally and words
// from adjacent paragraphs don't fuse together ("end" + "Start" -> "endStart").

// Caps what one document can put into the search index. PostgreSQL refuses a
// tsvector over ~1 MB, and nobody searches the millionth character.
export const MAX_SEARCH_TEXT = 200_000;

// Block nodes that end a line of text.
const LINE_BLOCKS = new Set(["paragraph", "heading", "codeBlock", "horizontalRule"]);

function collect(node: Y.XmlElement | Y.XmlFragment | Y.XmlText | Y.XmlHook, out: string[]): void {
  if (node instanceof Y.XmlText) {
    // toDelta() gives the runs of text without the formatting tags that
    // toString() would wrap them in ("<bold>hi</bold>").
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

// Control characters other than newline and tab are replaced with a space. That
// matters beyond tidiness: search highlights are delimited by two of them
// (SEARCH_MARK_START/END in @collabnotes/shared), and stripping them from
// content is what guarantees a document can never fake a highlight.
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
