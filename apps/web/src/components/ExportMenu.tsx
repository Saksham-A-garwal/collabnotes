import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { copyMarkdown, downloadMarkdown, printDocument } from "../lib/exportDocument.js";
import { DownloadIcon } from "./Icons.js";

// "Export" in the editor header: Markdown file, Markdown to the clipboard, or
// print / save as PDF. Available to every role — anyone who can read a document
// can already copy it, so hiding this from viewers would protect nothing.
export function ExportMenu({ editor, title }: { editor: Editor | null; title: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
        buttonRef.current?.focus(); // hand focus back to where the menu came from
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setStatus(null);
  }

  const markdown = (): string => editor?.getMarkdown() ?? "";

  function handleDownload() {
    downloadMarkdown(title, markdown());
    setStatus("Downloaded.");
  }

  async function handleCopy() {
    try {
      await copyMarkdown(title, markdown());
      setStatus("Copied Markdown to the clipboard.");
    } catch {
      setStatus("Couldn't copy — your browser blocked clipboard access.");
    }
  }

  function handlePrint() {
    close();
    // After the menu has closed and re-rendered, so it isn't in the printout.
    window.setTimeout(() => printDocument(title), 50);
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-ghost"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Export"
        disabled={!editor}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <DownloadIcon />
        <span className="btn-label">Export</span>
      </button>

      {open && (
        <div className="popover export-menu">
          <button type="button" className="popover-menu-item" onClick={handleDownload}>
            Download as Markdown (.md)
          </button>
          <button type="button" className="popover-menu-item" onClick={handleCopy}>
            Copy as Markdown
          </button>
          <button type="button" className="popover-menu-item" onClick={handlePrint}>
            Print or save as PDF
          </button>
          <p role="status" className="export-status">
            {status}
          </p>
        </div>
      )}
    </div>
  );
}
