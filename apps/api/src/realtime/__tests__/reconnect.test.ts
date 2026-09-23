import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db/pool.js";
import { hydrateDocument } from "../persistence.js";
import { createFixture, sleep, TestClient, waitFor, type Fixture } from "./harness.js";

describe("disconnect / reconnect (FR-16)", () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await createFixture("reconnect");
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  it("an edit made while offline reaches the server and other clients after reconnect", async () => {
    const a = new TestClient(fx, fx.ownerId);
    const b = new TestClient(fx, fx.editorId);
    await a.connect();
    await b.connect();

    a.insert("online;");
    await waitFor(() => b.text() === "online;");

    a.socket.disconnect();
    a.insert("offline;");
    expect(a.text()).toBe("online;offline;");

    await a.connect();
    await waitFor(() => b.text() === "online;offline;");

    const persisted = await hydrateDocument(fx.documentId);
    expect(persisted.getText("content").toString()).toBe("online;offline;");
  });

  it("both sides editing during a partition converge without loss", async () => {
    const a = new TestClient(fx, fx.ownerId);
    const b = new TestClient(fx, fx.editorId);
    await a.connect();
    await b.connect();
    const base = a.text();

    a.socket.disconnect();
    a.insert("A-offline;");
    b.insert("B-online;");
    await sleep(200);

    await a.connect();
    await waitFor(() => a.text() === b.text());
    expect(a.text()).toContain("A-offline;");
    expect(a.text()).toContain("B-online;");
    expect(a.text().length).toBe(base.length + "A-offline;".length + "B-online;".length);
  });

  it("100 rapid disconnect/reconnect cycles lose nothing (PRD §8 metric)", async () => {
    const a = new TestClient(fx, fx.ownerId);
    const observer = new TestClient(fx, fx.editorId);
    await a.connect();
    await observer.connect();

    const CYCLES = 100;
    for (let i = 0; i < CYCLES; i++) {
      a.socket.disconnect();
      a.insert(`<${i}>`);
      await a.connect();
    }

    const expected = Array.from({ length: CYCLES }, (_, i) => `<${i}>`);
    await waitFor(() => expected.every((token) => observer.text().includes(token)), 15000);

    const persisted = await hydrateDocument(fx.documentId);
    const persistedText = persisted.getText("content").toString();
    for (const token of expected) {
      expect(persistedText.split(token).length - 1).toBe(1);
    }
    expect(a.text()).toBe(persistedText);
    await pool.query("SELECT 1");
  }, 60000);
});
