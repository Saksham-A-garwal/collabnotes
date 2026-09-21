import { splitSnippet, type SearchResult } from "@collabnotes/shared";
import { relativeTime } from "../lib/relativeTime.js";
import { FileIcon } from "./Icons.js";

// One search result: the title, an excerpt with the matched words highlighted, and
// (for shared documents) the person's role. Highlights are built from text pieces
// and rendered as React text nodes, never as HTML, so nothing a document contains
// can turn into markup.
export function SearchHit({ result }: { result: SearchResult }) {
  return (
    <>
      <FileIcon />
      <span className="hit-main">
        <span className="doc-title">{result.title}</span>
        {result.snippet && (
          <span className="hit-snippet">
            {splitSnippet(result.snippet).map((part, i) =>
              part.match ? (
                <mark key={i} className="search-mark">
                  {part.text}
                </mark>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )}
          </span>
        )}
      </span>
      <span className="doc-meta">
        {result.role !== "owner" && <span className="badge">{result.role}</span>}
        <span className="doc-updated">{relativeTime(result.updatedAt)}</span>
      </span>
    </>
  );
}
