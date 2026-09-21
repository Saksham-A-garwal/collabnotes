import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { redisPub } from "../lib/redis.js";
import { rateLimit } from "./rateLimit.js";

// Regression: the limiter used to key on the *first* X-Forwarded-For entry,
// which the client controls — a fresh made-up value per request gave every
// request its own bucket and the limit never applied.
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function appWith(trustProxy: number, prefix: string) {
  const app = express();
  app.set("trust proxy", trustProxy);
  app.get("/", rateLimit({ keyPrefix: `${prefix}-${RUN}`, windowSeconds: 60, max: 2 }), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("rate limiter client address", () => {
  afterAll(async () => {
    const keys = await redisPub.keys(`ratelimit:*${RUN}*`);
    if (keys.length) await redisPub.del(...keys);
  });

  it("ignores a client-supplied X-Forwarded-For when no proxy is trusted", async () => {
    const app = appWith(0, "direct");
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      // A different spoofed "address" every time.
      statuses.push((await request(app).get("/").set("X-Forwarded-For", `10.0.0.${i}`)).status);
    }
    expect(statuses).toEqual([200, 200, 429, 429]);
  });

  it("behind one trusted proxy, believes only the entry that proxy appended — not what the client wrote", async () => {
    const app = appWith(1, "proxied");
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      // The client-invented left side varies; the proxy-appended right side is the same real client.
      statuses.push((await request(app).get("/").set("X-Forwarded-For", `6.6.6.${i}, 203.0.113.9`)).status);
    }
    expect(statuses).toEqual([200, 200, 429, 429]);
  });

  it("still separates genuinely different clients behind the proxy", async () => {
    const app = appWith(1, "clients");
    for (const client of ["203.0.113.10", "203.0.113.11", "203.0.113.12"]) {
      for (let i = 0; i < 2; i++) await request(app).get("/").set("X-Forwarded-For", client).expect(200);
    }
  });
});
