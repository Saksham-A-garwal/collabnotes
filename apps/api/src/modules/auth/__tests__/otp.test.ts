import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../config/env.js";
import { pool } from "../../../db/pool.js";
import { redisPub } from "../../../lib/redis.js";
import * as mailer from "../email/mailer.js";
import { hashCode, MAX_ATTEMPTS, nameFromEmail, requestLoginCode, verifyLoginCode } from "../otp.service.js";
import { readCodeFor, signInWithEmail } from "./helpers.js";

const RUN = Date.now().toString(36);
const emailFor = (name: string) => `otp-${name}-${RUN}@test.local`;
const dailyKey = () => `email:daily:${new Date().toISOString().slice(0, 10)}`;

describe("passwordless sign-in codes", () => {
  beforeAll(async () => {
    await pool.query("DELETE FROM login_codes WHERE email LIKE 'otp-%@test.local'");
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await pool.query("DELETE FROM login_codes WHERE email LIKE 'otp-%@test.local'");
    await pool.query("DELETE FROM users WHERE email LIKE 'otp-%@test.local'");
  });

  it("emails a 6-digit code and never stores it — only a keyed hash bound to the address", async () => {
    const email = emailFor("hash");
    await requestLoginCode(email);
    const code = await readCodeFor(email);
    expect(code).toMatch(/^\d{6}$/);

    const row = (await pool.query("SELECT code_hash FROM login_codes WHERE email = $1", [email])).rows[0];
    expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.code_hash).not.toContain(code);
    expect(row.code_hash).toBe(hashCode(email, code));
    expect(hashCode("someone-else@test.local", code)).not.toBe(row.code_hash);
  });

  it("signing in with the code creates the account, then signs the same account in next time", async () => {
    const email = emailFor("create");
    const first = await signInWithEmail(email);
    expect(first.isNewUser).toBe(true);
    expect(first.user.email).toBe(email);
    expect(first.user.display_name).toBe(nameFromEmail(email));

    const second = await signInWithEmail(email);
    expect(second.isNewUser).toBe(false);
    expect(second.user.id).toBe(first.user.id);
  });

  it("is single use: the same correct code can't sign in twice", async () => {
    const email = emailFor("single");
    await requestLoginCode(email);
    const code = await readCodeFor(email);
    await verifyLoginCode(email, code);
    await expect(verifyLoginCode(email, code)).rejects.toMatchObject({ code: "INVALID_CODE" });
  });

  it("caps wrong guesses: after 5 the correct code no longer works", async () => {
    const email = emailFor("cap");
    await requestLoginCode(email);
    const code = await readCodeFor(email);
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await expect(verifyLoginCode(email, wrong)).rejects.toMatchObject({ code: "INVALID_CODE" });
    }
    await expect(verifyLoginCode(email, wrong)).rejects.toMatchObject({
      code: "INVALID_CODE",
      message: expect.stringContaining("Request a new code"),
    });
    await expect(verifyLoginCode(email, code)).rejects.toMatchObject({ code: "INVALID_CODE" });
  });

  it("the cap holds under a burst of parallel guesses (no compare-then-count race)", async () => {
    const email = emailFor("burst");
    await requestLoginCode(email);
    const code = await readCodeFor(email);
    const guesses = Array.from({ length: 40 }, (_, i) => String(100000 + i).padStart(6, "0")).filter((g) => g !== code);
    await Promise.allSettled(guesses.map((g) => verifyLoginCode(email, g)));

    const { attempts } = (await pool.query("SELECT attempts FROM login_codes WHERE email = $1", [email])).rows[0];
    expect(attempts).toBeLessThanOrEqual(MAX_ATTEMPTS);
    await expect(verifyLoginCode(email, code)).rejects.toMatchObject({ code: "INVALID_CODE" });
  });

  it("codes expire", async () => {
    const email = emailFor("expiry");
    await requestLoginCode(email);
    const code = await readCodeFor(email);
    await pool.query("UPDATE login_codes SET expires_at = now() - interval '1 second' WHERE email = $1", [email]);
    await expect(verifyLoginCode(email, code)).rejects.toMatchObject({ code: "INVALID_CODE" });
  });

  it("a new code invalidates the previous one — only the latest email works", async () => {
    const email = emailFor("supersede");
    await requestLoginCode(email);
    const first = await readCodeFor(email);
    await requestLoginCode(email);
    const second = await readCodeFor(email);
    if (first !== second) {
      await expect(verifyLoginCode(email, first)).rejects.toMatchObject({ code: "INVALID_CODE" });
    }
    await expect(verifyLoginCode(email, second)).resolves.toMatchObject({ isNewUser: true });
  });

  it("a code for one address is useless for another", async () => {
    const a = emailFor("addr-a");
    const b = emailFor("addr-b");
    await requestLoginCode(a);
    await requestLoginCode(b);
    const codeA = await readCodeFor(a);
    const codeB = await readCodeFor(b);
    if (codeA !== codeB) await expect(verifyLoginCode(b, codeA)).rejects.toMatchObject({ code: "INVALID_CODE" });
  });

  it("gives the same answer for an existing account and an unknown address (no enumeration)", async () => {
    const existing = emailFor("enum-existing");
    await signInWithEmail(existing);
    const unknown = emailFor("enum-unknown");

    const a = await requestLoginCode(existing);
    const b = await requestLoginCode(unknown);
    expect(a).toEqual(b);
  });

  it("a failed send leaves no orphan code and doesn't kill the previous working one", async () => {
    const email = emailFor("sendfail");
    await requestLoginCode(email);
    const good = await readCodeFor(email);

    vi.spyOn(mailer, "sendEmail").mockRejectedValueOnce(new Error("Resend responded 503"));
    await expect(requestLoginCode(email)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });

    const { rows } = await pool.query("SELECT count(*)::int AS n FROM login_codes WHERE email = $1", [email]);
    expect(rows[0].n).toBe(1);
    await expect(verifyLoginCode(email, good)).resolves.toMatchObject({ isNewUser: true });
  });

  it("enforces a per-address cooldown between codes", async () => {
    const mutable = env as { OTP_RESEND_COOLDOWN_SECONDS: number };
    const original = mutable.OTP_RESEND_COOLDOWN_SECONDS;
    mutable.OTP_RESEND_COOLDOWN_SECONDS = 30;
    try {
      const email = emailFor("cooldown");
      await requestLoginCode(email);
      await expect(requestLoginCode(email)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    } finally {
      mutable.OTP_RESEND_COOLDOWN_SECONDS = original;
    }
  });

  it("stops sending once the daily cap is reached, so abuse can't drain the provider quota", async () => {
    const key = dailyKey();
    const before = await redisPub.get(key);
    await redisPub.set(key, String(env.EMAIL_DAILY_LIMIT), "EX", 60);
    try {
      const sendSpy = vi.spyOn(mailer, "sendEmail");
      await expect(requestLoginCode(emailFor("daily"))).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
      expect(sendSpy).not.toHaveBeenCalled();
    } finally {
      if (before === null) await redisPub.del(key);
      else await redisPub.set(key, before);
    }
  });

  it("derives a readable starting name from the address", () => {
    expect(nameFromEmail("saksham.agarwal@x.com")).toBe("Saksham Agarwal");
    expect(nameFromEmail("ada_lovelace+news@x.com")).toBe("Ada Lovelace");
    expect(nameFromEmail("JANE-DOE@x.com")).toBe("Jane Doe");
    expect(nameFromEmail("+@x.com")).toBe("New user");
  });
});
