import { createServer, type Server as HttpServer } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../config/env.js";
import { pool } from "../../../db/pool.js";
import { redisPub } from "../../../lib/redis.js";
import { attachRealtime } from "../../../realtime/index.js";
import { signInWithEmail } from "../../auth/__tests__/helpers.js";
import * as mailer from "../../auth/email/mailer.js";
import { latestOutboxEmail } from "../../auth/email/mailer.js";
import { takeDailySlot } from "../../auth/email/quota.js";
import { listAccessForOwner } from "../sharing.service.js";
import { inviteByEmail } from "../sharing.service.js";
import { OWNER_INVITE_EMAILS_PER_HOUR, RECIPIENT_INVITE_EMAILS_PER_DAY } from "../inviteNotifier.js";

// "Notify by email" makes the app email an address of the owner's choosing, so
// most of what's tested here is the fencing around that: when it sends, when it
// deliberately doesn't, and that nothing about the email can ever block or
// break the share itself.
const RUN = Date.now().toString(36);
const dailyKey = () => `email:daily:${new Date().toISOString().slice(0, 10)}`;

let server: HttpServer;
let ownerId: string;
let ownerEmail: string;
const documentIds: string[] = [];

async function newDocument(title = "Q3 planning"): Promise<string> {
  const r = await pool.query<{ id: string }>("INSERT INTO documents (owner_id, title) VALUES ($1, $2) RETURNING id", [ownerId, title]);
  documentIds.push(r.rows[0]!.id);
  return r.rows[0]!.id;
}
const addr = (name: string) => `invmail-${name}-${RUN}@test.local`;

describe("invitation emails", () => {
  beforeAll(async () => {
    // Inviting an existing user also updates their live session, which needs the realtime layer.
    server = createServer();
    attachRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    ownerEmail = addr("owner");
    const { user } = await signInWithEmail(ownerEmail);
    ownerId = user.id;
    await pool.query("UPDATE users SET display_name = 'Ada Lovelace' WHERE id = $1", [ownerId]);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.query("DELETE FROM documents WHERE id = ANY($1)", [documentIds]);
    await pool.query("DELETE FROM users WHERE email LIKE 'invmail-%@test.local'");
    await pool.query("DELETE FROM login_codes WHERE email LIKE 'invmail-%@test.local'");
    const keys = await redisPub.keys("invite-email:*");
    if (keys.length) await redisPub.del(...keys);
  });

  it("emails someone with no account yet: who invited them, what, their role, a link, and how to sign in", async () => {
    const documentId = await newDocument("Q3 planning");
    const to = addr("newbie");
    const { entry, notification } = await inviteByEmail(documentId, ownerId, to, "editor", { notify: true });

    expect(notification).toBe("sent");
    expect(entry).toMatchObject({ email: to, pending: true, role: "editor" });

    const mail = latestOutboxEmail(to)!;
    expect(mail.subject).toBe("Ada Lovelace invited you to “Q3 planning”");
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain("Ada Lovelace");
      expect(part).toContain("Q3 planning");
      expect(part).toContain(`${env.CORS_ORIGIN.split(",")[0]!.trim()}/documents/${documentId}`);
      expect(part).toContain("edit");
      expect(part).toContain("New to CollabNotes?"); // no account: explain the sign-in
    }
    expect(mail.html).toContain("Open document");
  });

  it("emails an existing user too, without the new-to-CollabNotes note", async () => {
    const documentId = await newDocument();
    const to = addr("existing");
    await signInWithEmail(to);
    const { notification } = await inviteByEmail(documentId, ownerId, to, "viewer", { notify: true });

    expect(notification).toBe("sent");
    const mail = latestOutboxEmail(to)!;
    expect(mail.text).toContain("view");
    expect(mail.text).not.toContain("New to CollabNotes?");
  });

  it("sends nothing unless asked (API default) — the share still happens", async () => {
    const documentId = await newDocument();
    const to = addr("quiet");
    const send = vi.spyOn(mailer, "sendEmail");

    const { entry, notification } = await inviteByEmail(documentId, ownerId, to, "editor");
    expect(notification).toBe("not-requested");
    expect(send).not.toHaveBeenCalled();
    expect(latestOutboxEmail(to)).toBeNull();
    expect((await listAccessForOwner(documentId, ownerId)).map((a) => a.email)).toContain(entry.email);
  });

  it("doesn't email again when they already have exactly this access", async () => {
    const documentId = await newDocument();
    const to = addr("repeat");
    await inviteByEmail(documentId, ownerId, to, "editor", { notify: true });

    const send = vi.spyOn(mailer, "sendEmail");
    const { notification } = await inviteByEmail(documentId, ownerId, to, "editor", { notify: true });
    expect(notification).toBe("unchanged");
    expect(send).not.toHaveBeenCalled();
  });

  it("cools down per document and address: flipping the role right away doesn't send a second email", async () => {
    const documentId = await newDocument();
    const to = addr("flip");
    expect((await inviteByEmail(documentId, ownerId, to, "viewer", { notify: true })).notification).toBe("sent");

    const send = vi.spyOn(mailer, "sendEmail");
    const second = await inviteByEmail(documentId, ownerId, to, "editor", { notify: true });
    expect(second.notification).toBe("limited");
    expect(second.entry.role).toBe("editor"); // the role change itself went through
    expect(send).not.toHaveBeenCalled();
  });

  it("a failed email never blocks or undoes the share", async () => {
    const documentId = await newDocument();
    const to = addr("failing");
    vi.spyOn(mailer, "sendEmail").mockRejectedValueOnce(new Error("Resend responded 503"));

    const { notification, entry } = await inviteByEmail(documentId, ownerId, to, "editor", { notify: true });
    expect(notification).toBe("failed");
    expect(entry.role).toBe("editor");
    expect((await listAccessForOwner(documentId, ownerId)).some((a) => a.email === to)).toBe(true);
  });

  it("caps how many invitation emails one owner can send per hour", async () => {
    // A fresh owner, so this doesn't eat the shared owner's budget.
    const { user: spammer } = await signInWithEmail(addr("spammer"));
    const doc = await pool.query<{ id: string }>("INSERT INTO documents (owner_id) VALUES ($1) RETURNING id", [spammer.id]);
    documentIds.push(doc.rows[0]!.id);

    const results: string[] = [];
    for (let i = 0; i <= OWNER_INVITE_EMAILS_PER_HOUR; i++) {
      const r = await inviteByEmail(doc.rows[0]!.id, spammer.id, addr(`victim${i}`), "viewer", { notify: true });
      results.push(r.notification);
    }
    expect(results.filter((r) => r === "sent")).toHaveLength(OWNER_INVITE_EMAILS_PER_HOUR);
    expect(results.at(-1)).toBe("limited");
    // ...and the last one was still shared, just not emailed.
    const access = await listAccessForOwner(doc.rows[0]!.id, spammer.id);
    expect(access.some((a) => a.email === addr(`victim${OWNER_INVITE_EMAILS_PER_HOUR}`))).toBe(true);
  });

  it("caps invitation emails per recipient per day, however many documents try", async () => {
    const to = addr("buried");
    const outcomes: string[] = [];
    for (let i = 0; i <= RECIPIENT_INVITE_EMAILS_PER_DAY; i++) {
      const documentId = await newDocument(`Doc ${i}`);
      outcomes.push((await inviteByEmail(documentId, ownerId, to, "viewer", { notify: true })).notification);
    }
    expect(outcomes.slice(0, RECIPIENT_INVITE_EMAILS_PER_DAY).every((o) => o === "sent")).toBe(true);
    expect(outcomes.at(-1)).toBe("limited");
  });

  it("invitations stop short of the daily budget so sign-in codes can still get through", async () => {
    const key = dailyKey();
    const before = await redisPub.get(key);
    const inviteCeiling = env.EMAIL_DAILY_LIMIT - env.EMAIL_SIGNIN_RESERVE;
    await redisPub.set(key, String(inviteCeiling), "EX", 120);
    try {
      const documentId = await newDocument();
      const send = vi.spyOn(mailer, "sendEmail");
      const { notification } = await inviteByEmail(documentId, ownerId, addr("budget"), "viewer", { notify: true });
      expect(notification).toBe("limited");
      expect(send).not.toHaveBeenCalled();
      // A refused invitation must not use up budget...
      expect(await redisPub.get(key)).toBe(String(inviteCeiling));
      // ...and a sign-in code still can.
      expect(await takeDailySlot("signin")).toBe(true);
    } finally {
      if (before === null) await redisPub.del(key);
      else await redisPub.set(key, before);
    }
  });

  it("escapes a hostile display name and document title, and keeps them out of the headers", async () => {
    const { user: villain } = await signInWithEmail(addr("villain"));
    await pool.query("UPDATE users SET display_name = $2 WHERE id = $1", [villain.id, `<script>alert(1)</script> Your Bank`]);
    const doc = await pool.query<{ id: string }>("INSERT INTO documents (owner_id, title) VALUES ($1, $2) RETURNING id", [
      villain.id,
      `"><img src=x onerror=alert(1)>\r\nBcc: attacker@evil.test\r\n\r\nFree money`,
    ]);
    documentIds.push(doc.rows[0]!.id);

    const to = addr("target");
    await inviteByEmail(doc.rows[0]!.id, villain.id, to, "editor", { notify: true });
    const mail = latestOutboxEmail(to)!;

    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.subject.length).toBeLessThanOrEqual(120);
  });
});
