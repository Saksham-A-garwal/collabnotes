import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixture, REMOTE, sleep, TestClient, waitFor, type Fixture } from "./harness.js";

describe("performance targets (PRD §8)", () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await createFixture("latency");
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  it("p95 edit propagation is under 300ms", async () => {
    const sender = new TestClient(fx, fx.ownerId);
    const receiver = new TestClient(fx, fx.editorId);
    await sender.connect();
    await receiver.connect();

    const arrivals = new Map<string, number>();
    receiver.doc.on("update", (_update: Uint8Array, origin: unknown) => {
      if (origin !== REMOTE) return;
      const text = receiver.text();
      for (const match of text.matchAll(/<(\d+)>/g)) {
        const key = match[1]!;
        if (!arrivals.has(key)) arrivals.set(key, performance.now());
      }
    });

    const SAMPLES = 100;
    const sentAt: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      sentAt[i] = performance.now();
      sender.insert(`<${i}>`);
      await sleep(15);
    }
    await waitFor(() => arrivals.size === SAMPLES, 10000);

    const latencies = sentAt
      .map((t, i) => arrivals.get(String(i))! - t)
      .sort((a, b) => a - b);
    const p95 = latencies[Math.floor(SAMPLES * 0.95) - 1]!;
    console.log(`relay latency over ${SAMPLES} edits: p50=${latencies[49]!.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${latencies[SAMPLES - 1]!.toFixed(1)}ms`);
    expect(p95).toBeLessThan(300);
  });

  it("5 simultaneous editors converge to identical content with nothing lost", async () => {
    const ids = [fx.ownerId, fx.editorId, fx.ownerId, fx.editorId, fx.ownerId];
    const clients = ids.map((id) => new TestClient(fx, id));
    for (const c of clients) await c.connect();

    const PER_CLIENT = 20;
    await Promise.all(
      clients.map(async (c, ci) => {
        for (let i = 0; i < PER_CLIENT; i++) {
          c.insert(`[c${ci}-${i}]`);
          await sleep(5 + ((ci * 7 + i) % 11));
        }
      }),
    );

    await waitFor(() => clients.every((c) => c.text() === clients[0]!.text()), 10000);
    const final = clients[0]!.text();
    for (let ci = 0; ci < clients.length; ci++) {
      for (let i = 0; i < PER_CLIENT; i++) expect(final).toContain(`[c${ci}-${i}]`);
    }
  });
});
