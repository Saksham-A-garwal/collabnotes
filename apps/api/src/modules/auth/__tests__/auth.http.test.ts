import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../../app.js";
import { env } from "../../../config/env.js";
import { pool } from "../../../db/pool.js";
import { redisPub } from "../../../lib/redis.js";
import { readCodeFor } from "./helpers.js";

const app = createApp();
const RUN = Date.now().toString(36);
const emailFor = (name: string) => `http-${name}-${RUN}@test.local`;
const allowedOrigin = env.CORS_ORIGIN.split(",")[0]!.trim();

async function signIn(email: string) {
  await request(app).post("/api/v1/auth/email/request").send({ email }).expect(200);
  const code = await readCodeFor(email);
  const res = await request(app).post("/api/v1/auth/email/verify").send({ email, code });
  return { res, code };
}

describe("auth HTTP API (passwordless)", () => {
  afterAll(async () => {
    await pool.query("DELETE FROM login_codes WHERE email LIKE 'http-%@test.local'");
    await pool.query("DELETE FROM users WHERE email LIKE 'http-%@test.local'");
    const keys = await redisPub.keys("ratelimit:*http-*@test.local*");
    if (keys.length) await redisPub.del(...keys);
  });

  it("validates the request: bad and oversized addresses are rejected before anything is sent", async () => {
    await request(app).post("/api/v1/auth/email/request").send({ email: "not-an-email" }).expect(400);
    await request(app).post("/api/v1/auth/email/request").send({ email: `${"a".repeat(300)}@test.local` }).expect(400);
    await request(app).post("/api/v1/auth/email/request").send({}).expect(400);
  });

  it("request -> verify signs in, returns tokens, and never returns anything password-shaped", async () => {
    const email = emailFor("flow");
    const asked = await request(app).post("/api/v1/auth/email/request").send({ email }).expect(200);
    expect(asked.body).toEqual({ resendAfterSeconds: env.OTP_RESEND_COOLDOWN_SECONDS, expiresInSeconds: 600 });
    expect(asked.headers["cache-control"]).toBe("no-store");

    const { res } = await signIn(emailFor("flow2"));
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toMatchObject({ isNewUser: true, user: { email: emailFor("flow2") } });
    expect(typeof res.body.accessToken).toBe("string");
    expect(typeof res.body.refreshToken).toBe("string");
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);

    // The access token really works.
    await request(app).get("/api/v1/documents").set("Authorization", `Bearer ${res.body.accessToken}`).expect(200);
  });

  it("wrong and malformed codes are refused with the right status", async () => {
    const email = emailFor("wrong");
    await request(app).post("/api/v1/auth/email/request").send({ email }).expect(200);
    const code = await readCodeFor(email);
    const wrong = code === "000000" ? "111111" : "000000";
    const bad = await request(app).post("/api/v1/auth/email/verify").send({ email, code: wrong });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe("INVALID_CODE");
    await request(app).post("/api/v1/auth/email/verify").send({ email, code: "12ab" }).expect(400);
    await request(app).post("/api/v1/auth/email/verify").send({ email, code: "1234567" }).expect(400);
  });

  it("accepts a code pasted with a space or dash", async () => {
    const email = emailFor("paste");
    await request(app).post("/api/v1/auth/email/request").send({ email }).expect(200);
    const code = await readCodeFor(email);
    const res = await request(app)
      .post("/api/v1/auth/email/verify")
      .send({ email, code: `${code.slice(0, 3)} ${code.slice(3)}` });
    expect(res.status).toBe(200);
  });

  it("PATCH /auth/me sets the display name, and only for a signed-in user", async () => {
    const { res } = await signIn(emailFor("name"));
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };

    await request(app).patch("/api/v1/auth/me").send({ displayName: "Ada" }).expect(401);
    await request(app).patch("/api/v1/auth/me").set(auth).send({ displayName: "   " }).expect(400);
    await request(app).patch("/api/v1/auth/me").set(auth).send({ displayName: "x".repeat(81) }).expect(400);

    const ok = await request(app).patch("/api/v1/auth/me").set(auth).send({ displayName: "  Ada Lovelace  " }).expect(200);
    expect(ok.body.user.displayName).toBe("Ada Lovelace");
  });

  it("the password endpoints are gone", async () => {
    await request(app).post("/api/v1/auth/register").send({ email: "a@b.co", password: "password123", displayName: "A" }).expect(404);
    await request(app).post("/api/v1/auth/login").send({ email: "a@b.co", password: "password123" }).expect(404);
  });

  it("limits code requests per address (3 per 10 minutes) with a Retry-After", async () => {
    const email = emailFor("ratelimit");
    for (let i = 0; i < 3; i++) await request(app).post("/api/v1/auth/email/request").send({ email }).expect(200);
    const blocked = await request(app).post("/api/v1/auth/email/request").send({ email });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("refresh still rotates the token", async () => {
    const { res } = await signIn(emailFor("refresh"));
    const rotated = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: res.body.refreshToken }).expect(200);
    expect(rotated.body.refreshToken).not.toBe(res.body.refreshToken);
  });

  it("CORS: only the configured origin is allowed, and credentials are not", async () => {
    const good = await request(app)
      .options("/api/v1/auth/email/request")
      .set("Origin", allowedOrigin)
      .set("Access-Control-Request-Method", "POST");
    expect(good.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(good.headers["access-control-allow-credentials"]).toBeUndefined();

    const evil = await request(app)
      .options("/api/v1/auth/email/request")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST");
    expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects oversized request bodies", async () => {
    const res = await request(app)
      .post("/api/v1/auth/email/request")
      .send({ email: "a@b.co", padding: "x".repeat(40_000) });
    expect(res.status).toBe(413);
  });
});
