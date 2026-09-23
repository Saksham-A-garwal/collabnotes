import { splitSnippet, type SearchResult } from "@collabnotes/shared";
import { relativeTime } from "../lib/relativeTime.js";
import { FileIcon } from "./Icons.js";

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
