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
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyMarkdown(title: string, markdownBody: string): Promise<void> {
  await navigator.clipboard.writeText(withTitle(title, markdownBody));
}

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
