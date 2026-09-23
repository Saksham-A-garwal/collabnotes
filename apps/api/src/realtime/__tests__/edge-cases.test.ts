import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { redisPub } from "../../lib/redis.js";
import { deleteDocumentForUser } from "../../modules/documents/documents.service.js";
import { inviteByEmail } from "../../modules/sharing/sharing.service.js";
import { hydrateDocument } from "../persistence.js";
import { createFixture, sleep, TestClient, waitFor, type Fixture } from "./harness.js";

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

    a.doc.getText("content").insert(0, "AAAA");
    b.doc.getText("content").insert(0, "BBBB");

    await waitFor(() => a.text() === b.text() && a.text().length === 8);
    expect(a.text()).toContain("AAAA");
    expect(a.text()).toContain("BBBB");
    expect(a.events.length + b.events.length).toBe(0);
  });

  it("role downgraded mid-session: the very next write is rejected server-side, and the client is told", async () => {
    const editor = new TestClient(fx, fx.editorId);
    const owner = new TestClient(fx, fx.ownerId);
    await editor.connect();
    await owner.connect();
    expect(editor.role).toBe("editor");

    const before = owner.text();
    await inviteByEmail(fx.documentId, fx.ownerId, `edge-editor@test.local`, "viewer");
    await waitFor(() => editor.events.some((e) => e.name === "document:role-changed"));
    expect(editor.events.find((e) => e.name === "document:role-changed")?.payload).toMatchObject({
      role: "viewer",
    });

    editor.insert("SNEAKY");
    await sleep(300);
    expect(owner.text()).toBe(before);
    expect(editor.events.some((e) => e.name === "document:error")).toBe(true);

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

  it("Redis failing (quota exhausted / outage) degrades to single-instance instead of crashing or losing edits", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    const publish = vi.spyOn(redisPub, "publish").mockRejectedValue(new Error("ERR max requests limit exceeded"));

    try {
      const a = new TestClient(fx, fx.ownerId);
      const b = new TestClient(fx, fx.editorId);
      await a.connect();
      await b.connect();

      const before = b.text();
      a.insert("still-works;");
      await waitFor(() => b.text() === before + "still-works;");

      await sleep(200);
      expect(publish).toHaveBeenCalled();
      expect(unhandled).toHaveLength(0);

      const persisted = await hydrateDocument(fx.documentId);
      expect(persisted.getText("content").toString()).toContain("still-works;");
    } finally {
      publish.mockRestore();
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
