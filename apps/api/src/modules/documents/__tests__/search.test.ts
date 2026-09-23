import jwt from "jsonwebtoken";
import request from "supertest";
import * as Y from "yjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEARCH_MARK_END, SEARCH_MARK_START, splitSnippet, type SearchResult } from "@collabnotes/shared";
import { createApp } from "../../../app.js";
import { env } from "../../../config/env.js";
import { pool } from "../../../db/pool.js";
import { redisPub } from "../../../lib/redis.js";
import { indexDocumentText } from "../../../realtime/searchIndex.js";
import { signInWithEmail } from "../../auth/__tests__/helpers.js";
import { removeAccess } from "../../../db/queries/sharing.js";

const app = createApp();
const RUN = Date.now().toString(36);
const addr = (name: string) => `srch-${name}-${RUN}@test.local`;
const tokenFor = (userId: string) => jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: "5m" });

let ownerId: string;
let strangerId: string;
let viewerId: string;
const documentIds: string[] = [];

async function makeDocument(ownerUserId: string, title: string, ...paragraphs: string[]): Promise<string> {
  const row = await pool.query<{ id: string }>("INSERT INTO documents (owner_id, title) VALUES ($1, $2) RETURNING id", [ownerUserId, title]);
  const id = row.rows[0]!.id;
  documentIds.push(id);
  const doc = new Y.Doc();
  doc.transact(() => {
    const root = doc.getXmlFragment("default");
    for (const text of paragraphs) {
      const p = new Y.XmlElement("paragraph");
      root.insert(root.length, [p]);
      const run = new Y.XmlText();
      p.insert(0, [run]);
      run.insert(0, text);
    }
  });
  await indexDocumentText(id, doc, { touch: false });
  return id;
}

async function search(userId: string, q: string, extra = ""): Promise<{ status: number; results: SearchResult[] }> {
  const res = await request(app).get(`/api/v1/documents/search?q=${encodeURIComponent(q)}${extra}`).set("Authorization", `Bearer ${tokenFor(userId)}`);
  return { status: res.status, results: res.body.results ?? [] };
}

describe("document search", () => {
  beforeAll(async () => {
    ownerId = (await signInWithEmail(addr("owner"))).user.id;
    strangerId = (await signInWithEmail(addr("stranger"))).user.id;
    viewerId = (await signInWithEmail(addr("viewer"))).user.id;
  });
  afterAll(async () => {
    await pool.query("DELETE FROM documents WHERE id = ANY($1)", [documentIds]);
    await pool.query("DELETE FROM users WHERE email LIKE 'srch-%@test.local'");
    await pool.query("DELETE FROM login_codes WHERE email LIKE 'srch-%@test.local'");
    const keys = await redisPub.keys("ratelimit:*srch-*");
    if (keys.length) await redisPub.del(...keys);
  });

  it("finds a document by a word in its body, with the match highlighted in a snippet", async () => {
    const id = await makeDocument(ownerId, "Untitled document", "We agreed the quokka migration ships in March.");
    const { results } = await search(ownerId, "quokka");
    const hit = results.find((r) => r.id === id)!;
    expect(hit).toBeDefined();
    expect(hit.role).toBe("owner");
    expect(hit.snippet).toContain(`${SEARCH_MARK_START}quokka${SEARCH_MARK_END}`);
    expect(splitSnippet(hit.snippet!).find((p) => p.match)?.text).toBe("quokka");
  });

  it("understands word forms: 'planning' finds 'plan' and vice versa", async () => {
    const id = await makeDocument(ownerId, "Notes", "Our plan for the flibbertigibbet launch.");
    expect((await search(ownerId, "planning flibbertigibbet")).results.map((r) => r.id)).toContain(id);
    expect((await search(ownerId, "plans")).results.some((r) => r.id === id)).toBe(true);
  });

  it("matches as you type: a partial last word still finds the document", async () => {
    const id = await makeDocument(ownerId, "Notes", "The xylophoneorchestra rehearsal is on Friday.");
    expect((await search(ownerId, "xylophoneorch")).results.map((r) => r.id)).toContain(id);
  });

  it("finds a document by title, and ranks a title match above a body match", async () => {
    const bodyOnly = await makeDocument(ownerId, "Meeting", "Discuss the wombatrollout schedule.");
    const titleHit = await makeDocument(ownerId, "Wombatrollout kickoff", "Nothing relevant here.");
    const { results } = await search(ownerId, "wombatrollout");
    const ids = results.map((r) => r.id);
    expect(ids).toContain(titleHit);
    expect(ids).toContain(bodyOnly);
    expect(ids.indexOf(titleHit)).toBeLessThan(ids.indexOf(bodyOnly));
    expect(results.find((r) => r.id === titleHit)!.snippet).toBeNull();
  });

  it("supports quoted phrases and excluded words", async () => {
    const both = await makeDocument(ownerId, "A", "The purple giraffe dances at midnight.");
    const other = await makeDocument(ownerId, "B", "A giraffe that is purple but not dancing anywhere.");
    const phrase = (await search(ownerId, `"purple giraffe"`)).results.map((r) => r.id);
    expect(phrase).toContain(both);
    expect(phrase).not.toContain(other);

    const excluded = (await search(ownerId, "giraffe -midnight")).results.map((r) => r.id);
    expect(excluded).toContain(other);
    expect(excluded).not.toContain(both);
  });

  it("never returns a document the caller can't open", async () => {
    const secret = await makeDocument(ownerId, "Private plans", "The confidential zebrafinch acquisition.");
    expect((await search(strangerId, "zebrafinch")).results).toEqual([]);
    expect((await search(strangerId, "Private plans")).results).toEqual([]);
    expect((await search(ownerId, "zebrafinch")).results.map((r) => r.id)).toContain(secret);
  });

  it("shows a collaborator the document with their role; a pending invite sees nothing; removal takes it away", async () => {
    const id = await makeDocument(ownerId, "Shared", "The sharedwalrus proposal.");
    await pool.query("INSERT INTO document_access (document_id, user_id, role) VALUES ($1, $2, 'viewer')", [id, viewerId]);
    await pool.query("INSERT INTO document_access (document_id, invited_email, role) VALUES ($1, $2, 'editor')", [id, addr("pending")]);

    const asViewer = (await search(viewerId, "sharedwalrus")).results.find((r) => r.id === id);
    expect(asViewer?.role).toBe("viewer");
    expect((await search(strangerId, "sharedwalrus")).results).toEqual([]);

    await removeAccess(id, viewerId);
    expect((await search(viewerId, "sharedwalrus")).results).toEqual([]);
  });

  it("treats % and _ in the query literally, and shrugs off SQL", async () => {
    const literal = await makeDocument(ownerId, "snake_case names", "x");
    const decoy = await makeDocument(ownerId, "snakexcase names", "y");
    const ids = (await search(ownerId, "snake_case")).results.map((r) => r.id);
    expect(ids).toContain(literal);
    expect(ids).not.toContain(decoy);

    const before = (await pool.query("SELECT count(*)::int AS n FROM documents")).rows[0].n;
    for (const evil of [`'; DROP TABLE documents; --`, `") OR 1=1 --`, `%`, `\\`, `a & b | !c`, `:*`, `(((`]) {
      const res = await search(ownerId, evil.length < 2 ? `${evil}${evil}` : evil);
      expect(res.status).toBe(200);
    }
    expect((await pool.query("SELECT count(*)::int AS n FROM documents")).rows[0].n).toBe(before);
  });

  it("indexing bumps updated_at only when the text really changed, and never during a backfill", async () => {
    const id = await makeDocument(ownerId, "Clock", "original words");
    const stamp = async () => (await pool.query("SELECT updated_at FROM documents WHERE id = $1", [id])).rows[0].updated_at.getTime();
    const before = await stamp();
    await new Promise((r) => setTimeout(r, 15));

    const same = new Y.Doc();
    same.transact(() => {
      const p = new Y.XmlElement("paragraph");
      same.getXmlFragment("default").insert(0, [p]);
      const t = new Y.XmlText();
      p.insert(0, [t]);
      t.insert(0, "original words");
    });
    await indexDocumentText(id, same, { touch: true });
    expect(await stamp()).toBe(before);

    const changed = new Y.Doc();
    changed.transact(() => {
      const p = new Y.XmlElement("paragraph");
      changed.getXmlFragment("default").insert(0, [p]);
      const t = new Y.XmlText();
      p.insert(0, [t]);
      t.insert(0, "brand new words");
    });
    await indexDocumentText(id, changed, { touch: false });
    expect(await stamp()).toBe(before);
    await indexDocumentText(id, same, { touch: true });
    expect(await stamp()).toBeGreaterThan(before);
  });

  describe("HTTP", () => {
    it("requires a signed-in user and a query of at least two characters", async () => {
      await request(app).get("/api/v1/documents/search?q=hello").expect(401);
      expect((await search(ownerId, "a")).status).toBe(400);
      expect((await search(ownerId, "   ")).status).toBe(400);
      const missing = await request(app).get("/api/v1/documents/search").set("Authorization", `Bearer ${tokenFor(ownerId)}`);
      expect(missing.status).toBe(400);
      expect((await search(ownerId, "x".repeat(201))).status).toBe(400);
    });

    it("respects the limit", async () => {
      for (let i = 0; i < 4; i++) await makeDocument(ownerId, `Limit doc ${i}`, "the limitmarker text");
      expect((await search(ownerId, "limitmarker", "&limit=2")).results).toHaveLength(2);
      expect((await search(ownerId, "limitmarker", "&limit=0")).status).toBe(400);
      expect((await search(ownerId, "limitmarker", "&limit=51")).status).toBe(400);
    });

    it("rate-limits a single user (120 a minute)", async () => {
      const spammer = (await signInWithEmail(addr("spammer"))).user.id;
      let limited = 0;
      for (let i = 0; i < 125; i++) if ((await search(spammer, "anything")).status === 429) limited++;
      expect(limited).toBeGreaterThanOrEqual(5);
    });
  });
});
