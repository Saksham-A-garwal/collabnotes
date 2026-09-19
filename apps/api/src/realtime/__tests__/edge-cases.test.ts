import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteDocumentForUser } from "../../modules/documents/documents.service.js";
import { inviteByEmail } from "../../modules/sharing/sharing.service.js";
import { hydrateDocument } from "../persistence.js";
import { createFixture, sleep, TestClient, waitFor, type Fixture } from "./harness.js";

// SRS §8 "Edge Cases (must be explicitly handled, not just 'should work')".
describe("SRS §8 edge cases", () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await createFixture("edge");
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  it("two clients inserting at the exact same position merge without error or loss", async () => {
    const a = new TestClient(fx, fx.ownerId);
    const b = new TestClient(fx, fx.editorId);
    await a.connect();
    await b.connect();

    // Both insert at index 0 of the same (empty) text concurrently.
    a.doc.getText("content").insert(0, "AAAA");
    b.doc.getText("content").insert(0, "BBBB");

    await waitFor(() => a.text() === b.text() && a.text().length === 8);
    expect(a.text()).toContain("AAAA");
    expect(a.text()).toContain("BBBB");
    // No conflict UI, no error event — the CRDT resolved it.
    expect(a.events.length + b.events.length).toBe(0);
  });

  it("role downgraded mid-session: the very next write is rejected server-side, and the client is told", async () => {
    const editor = new TestClient(fx, fx.editorId);
    const owner = new TestClient(fx, fx.ownerId);
    await editor.connect();
    await owner.connect();
    expect(editor.role).toBe("editor");

    const before = owner.text();
    // Owner downgrades the connected editor to viewer.
    await inviteByEmail(fx.documentId, fx.ownerId, `edge-editor@test.local`, "viewer");
    await waitFor(() => editor.events.some((e) => e.name === "document:role-changed"));
    expect(editor.events.find((e) => e.name === "document:role-changed")?.payload).toMatchObject({
      role: "viewer",
    });

    // An in-flight edit from that socket must not reach anyone (FR-14/FR-17).
    editor.insert("SNEAKY");
    await sleep(300);
    expect(owner.text()).toBe(before);
    expect(editor.events.some((e) => e.name === "document:error")).toBe(true);

    // ...and upgrading back works live too.
    await inviteByEmail(fx.documentId, fx.ownerId, `edge-editor@test.local`, "editor");
    await waitFor(() => editor.events.filter((e) => e.name === "document:role-changed").length === 2);
    const persisted = await hydrateDocument(fx.documentId);
    expect(persisted.getText("content").toString()).not.toContain("SNEAKY");
  });

  it("document deleted while open: every socket in the room is notified, then disconnected (FR-11)", async () => {
    const fx2 = await createFixture("edgedel");
    try {
      const a = new TestClient(fx2, fx2.ownerId);
      const b = new TestClient(fx2, fx2.editorId);
      await a.connect();
      await b.connect();

      await deleteDocumentForUser(fx2.documentId, fx2.ownerId);

      await waitFor(() => !a.socket.connected && !b.socket.connected);
      expect(a.events.some((e) => e.name === "document:deleted")).toBe(true);
      expect(b.events.some((e) => e.name === "document:deleted")).toBe(true);
    } finally {
      await fx2.cleanup();
    }
  });
});
