import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../../app.js";
import { pool } from "../../../db/pool.js";
import { redisPub } from "../../../lib/redis.js";
import { readCodeFor } from "../../auth/__tests__/helpers.js";
import { latestOutboxEmail } from "../../auth/email/mailer.js";

const app = createApp();
const RUN = Date.now().toString(36);
const addr = (name: string) => `invhttp-${name}-${RUN}@test.local`;

async function signIn(email: string): Promise<string> {
  await request(app).post("/api/v1/auth/email/request").send({ email }).expect(200);
  const code = await readCodeFor(email);
  const res = await request(app).post("/api/v1/auth/email/verify").send({ email, code }).expect(200);
  return res.body.accessToken as string;
}

describe("POST /documents/:id/share/invite (HTTP)", () => {
  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE 'invhttp-%@test.local'");
    await pool.query("DELETE FROM login_codes WHERE email LIKE 'invhttp-%@test.local'");
    const keys = [...(await redisPub.keys("invite-email:*")), ...(await redisPub.keys("ratelimit:*invhttp-*"))];
    if (keys.length) await redisPub.del(...keys);
  });

  it("returns the notification outcome: emailed when asked, not-requested otherwise, and rejects a non-boolean", async () => {
    const token = await signIn(addr("owner"));
    const auth = { Authorization: `Bearer ${token}` };
    const created = await request(app).post("/api/v1/documents").set(auth).send({ title: "Roadmap" }).expect(201);
    const id = created.body.document.id as string;

    const to = addr("teammate");
    const sent = await request(app).post(`/api/v1/documents/${id}/share/invite`).set(auth).send({ email: to, role: "editor", notify: true });
    expect(sent.status).toBe(201);
    expect(sent.body.notification).toBe("sent");
    expect(sent.body.access).toMatchObject({ email: to, role: "editor", pending: true });
    expect(latestOutboxEmail(to)?.subject).toContain("Roadmap");

    const quiet = await request(app).post(`/api/v1/documents/${id}/share/invite`).set(auth).send({ email: addr("quiet"), role: "viewer" });
    expect(quiet.status).toBe(201);
    expect(quiet.body.notification).toBe("not-requested");
    expect(latestOutboxEmail(addr("quiet"))).toBeNull();

    await request(app).post(`/api/v1/documents/${id}/share/invite`).set(auth).send({ email: addr("x"), role: "viewer", notify: "yes" }).expect(400);
  });

  it("only the owner can invite (and so only the owner can make the app send an email)", async () => {
    const ownerToken = await signIn(addr("owner2"));
    const created = await request(app).post("/api/v1/documents").set({ Authorization: `Bearer ${ownerToken}` }).send({}).expect(201);
    const id = created.body.document.id as string;

    const strangerToken = await signIn(addr("stranger"));
    const res = await request(app)
      .post(`/api/v1/documents/${id}/share/invite`)
      .set({ Authorization: `Bearer ${strangerToken}` })
      .send({ email: addr("victim"), role: "editor", notify: true });
    expect([403, 404]).toContain(res.status);
    expect(latestOutboxEmail(addr("victim"))).toBeNull();
  });
});
