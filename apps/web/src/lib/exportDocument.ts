// Getting a document *out* of CollabNotes. Everything here runs in the browser,
// from what the editor already has on screen — so it needs no server round trip,
// works the same for viewers as for editors (they can already read it), and
// can't leak anything a person couldn't already see.

// A title is user-typed and ends up as a file name on someone's disk. Strip what
// operating systems forbid or treat specially ( \ / : * ? " < > | and control
// characters), collapse whitespace, avoid names that are only dots, and keep it
// a sane length. Never returns an empty string.
export function safeFilename(title: string, fallback = "document"): string {
  let cleaned = "";
  for (const ch of title) {
    const code = ch.charCodeAt(0);
    cleaned += code < 0x20 || code === 0x7f || '\\/:*?"<>|'.includes(ch) ? " " : ch;
  }
  cleaned = cleaned.replace(/\s+/g, " ").replace(/^[.\s]+/, "").trim();
  if (cleaned.length > 80) cleaned = cleaned.slice(0, 80).trimEnd();
  return cleaned || fallback;
}

// The file starts with the document's title as a heading: the title lives outside
// the editor content, so without this the exported file would have lost its name.
export function withTitle(title: string, markdownBody: string): string {
  const heading = title.trim() || "Untitled document";
  return `# ${heading}\n\n${markdownBody.trim()}\n`;
}

export function downloadMarkdown(title: string, markdownBody: string): void {
  const blob = new Blob([withTitle(title, markdownBody)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFilename(title)}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyMarkdown(title: string, markdownBody: string): Promise<void> {
  await navigator.clipboard.writeText(withTitle(title, markdownBody));
}

// "Save as PDF" is the browser's own print dialog, driven by the @media print
// rules in index.css (they hide everything but the document). Browsers use the
// page title as the default file name, so it's swapped for the document's title
// for the duration of the print dialog.
export function printDocument(title: string): void {
  const previous = document.title;
  document.title = safeFilename(title, "Untitled document");
  const restore = (): void => {
    document.title = previous;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
}
