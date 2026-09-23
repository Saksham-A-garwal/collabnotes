import * as Y from "yjs";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { extractPlainText } from "./extractText.js";
import { hydrateDocument } from "./persistence.js";

export async function indexDocumentText(
  documentId: string,
  doc: Y.Doc,
  opts: { touch: boolean },
): Promise<void> {
  const text = extractPlainText(doc);
  await pool.query(
    opts.touch
      ? `UPDATE documents
         SET updated_at = CASE WHEN search_text IS DISTINCT FROM $2 THEN now() ELSE updated_at END,
             search_text = $2,
             search_indexed_at = now()
         WHERE id = $1`
      : `UPDATE documents SET search_text = $2, search_indexed_at = now() WHERE id = $1`,
    [documentId, text],
  );
}

export function createSearchIndexer(getDoc: (documentId: string) => Y.Doc | undefined) {
  const timers = new Map<string, NodeJS.Timeout>();

  async function run(documentId: string): Promise<void> {
    timers.delete(documentId);
    const doc = getDoc(documentId);
    if (!doc) return;
    try {
      await indexDocumentText(documentId, doc, { touch: true });
    } catch (err) {
      console.error(JSON.stringify({ level: "error", message: "search indexing failed", documentId, error: (err as Error).message }));
    }
  }

  return {
    schedule(documentId: string): void {
      const existing = timers.get(documentId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => void run(documentId), env.SEARCH_INDEX_DEBOUNCE_MS);
      timer.unref();
      timers.set(documentId, timer);
    },

    async flush(documentId: string): Promise<void> {
      const existing = timers.get(documentId);
      if (existing) clearTimeout(existing);
      await run(documentId);
    },

    async flushAll(): Promise<void> {
      await Promise.all([...timers.keys()].map((id) => this.flush(id)));
    },

    pending(): number {
      return timers.size;
    },
  };
}

export type SearchIndexer = ReturnType<typeof createSearchIndexer>;

export async function backfillSearchIndex(): Promise<number> {
  let indexed = 0;
  const seen = new Set<string>();
  for (;;) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT d.id FROM documents d
       WHERE d.search_indexed_at IS NULL
          OR EXISTS (SELECT 1 FROM document_updates u WHERE u.document_id = d.id AND u.created_at > d.search_indexed_at)
       ORDER BY d.created_at
       LIMIT 25`,
    );
    const fresh = rows.filter((r) => !seen.has(r.id));
    if (fresh.length === 0) break;

    for (const { id } of fresh) {
      seen.add(id);
      try {
        const doc = await hydrateDocument(id);
        await indexDocumentText(id, doc, { touch: false });
        doc.destroy();
        indexed++;
      } catch (err) {
        console.error(JSON.stringify({ level: "error", message: "search backfill failed for a document", documentId: id, error: (err as Error).message }));
      }
    }
  }
  return indexed;
}
