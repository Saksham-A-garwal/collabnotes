import * as Y from "yjs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { pool } from "../../db/pool.js";
import { appendUpdate } from "../persistence.js";
import { backfillSearchIndex, createSearchIndexer } from "../searchIndex.js";
import { createFixture, sleep, TestClient, waitFor, type Fixture } from "./harness.js";

const searchText = async (documentId: string): Promise<string> =>
  (await pool.query("SELECT search_text FROM documents WHERE id = $1", [documentId])).rows[0].search_text;

function docWith(text: string): Y.Doc {
  const doc = new Y.Doc();
  doc.transact(() => {
    const p = new Y.XmlElement("paragraph");
    doc.getXmlFragment("default").insert(0, [p]);
    const run = new Y.XmlText();
    p.insert(0, [run]);
    run.insert(0, text);
  });
  return doc;
}

describe("search indexing", () => {
  let fx: Fixture;
  beforeAll(async () => {
    fx = await createFixture("srchidx");
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    await fx.cleanup();
  });

  it("is debounced: each edit restarts the countdown, and it only fires once typing stops", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const indexer = createSearchIndexer(() => docWith("debounced words"));

    indexer.schedule(fx.documentId);
    vi.advanceTimersByTime(100);
    indexer.schedule(fx.documentId); // more typing: countdown restarts
    vi.advanceTimersByTime(100); // 200ms since the first edit — would have fired if not debounced
    expect(indexer.pending()).toBe(1);

    vi.advanceTimersByTime(60); // now 160ms since the *last* edit
    expect(indexer.pending()).toBe(0); // fired
    vi.useRealTimers();
    await waitFor(async () => (await searchText(fx.documentId)) === "debounced words");
  });

  it("indexes real edits made over the socket a moment after typing stops", async () => {
    const client = new TestClient(fx, fx.ownerId);
    await client.connect();
    const before = (await pool.query("SELECT updated_at FROM documents WHERE id = $1", [fx.documentId])).rows[0].updated_at.getTime();

    // The test client edits a plain Y.Text; the live indexer reads the editor's XML
    // fragment, so drive the fragment the way the real editor does.
    client.doc.transact(() => {
      const root = client.doc.getXmlFragment("default");
      const p = new Y.XmlElement("paragraph");
      root.insert(root.length, [p]);
      const run = new Y.XmlText();
      p.insert(0, [run]);
      run.insert(0, "the zeppelin hangar is open");
    });

    await waitFor(async () => (await searchText(fx.documentId)).includes("zeppelin hangar"), 6000);
    const after = (await pool.query("SELECT updated_at FROM documents WHERE id = $1", [fx.documentId])).rows[0].updated_at.getTime();
    expect(after).toBeGreaterThan(before); // the dashboard's "Updated …" now reflects the edit
    client.socket.disconnect();
  });

  it("backfills documents that predate search, without touching updated_at", async () => {
    const other = await createFixture("srchbackfill");
    try {
      const d = docWith("legacy pterodactyl content");
      await appendUpdate(other.documentId, Y.encodeStateAsUpdate(d));
      const stamp = async () => (await pool.query("SELECT updated_at FROM documents WHERE id = $1", [other.documentId])).rows[0].updated_at.getTime();
      const before = await stamp();
      expect(await searchText(other.documentId)).toBe(""); // never indexed
      await sleep(15);

      const indexed = await backfillSearchIndex();
      expect(indexed).toBeGreaterThanOrEqual(1);
      expect(await searchText(other.documentId)).toBe("legacy pterodactyl content");
      expect(await stamp()).toBe(before); // re-indexing is not an edit

      // Idempotent: nothing left to do.
      expect(await backfillSearchIndex()).toBe(0);
    } finally {
      await other.cleanup();
    }
  });

  it("re-indexes a document edited after its last index (a pending debounce lost to a restart)", async () => {
    const other = await createFixture("srchstale");
    try {
      await appendUpdate(other.documentId, Y.encodeStateAsUpdate(docWith("first version")));
      await backfillSearchIndex();
      expect(await searchText(other.documentId)).toBe("first version");

      // An edit lands after the last index — as if the process died before the debounce fired.
      await pool.query("UPDATE documents SET search_indexed_at = now() - interval '1 hour' WHERE id = $1", [other.documentId]);
      const edited = docWith("first version");
      const p = new Y.XmlElement("paragraph");
      edited.getXmlFragment("default").insert(1, [p]);
      const run = new Y.XmlText();
      p.insert(0, [run]);
      run.insert(0, "and a second paragraph");
      await appendUpdate(other.documentId, Y.encodeStateAsUpdate(edited));

      await backfillSearchIndex();
      expect(await searchText(other.documentId)).toContain("second paragraph");
    } finally {
      await other.cleanup();
    }
  });
});
