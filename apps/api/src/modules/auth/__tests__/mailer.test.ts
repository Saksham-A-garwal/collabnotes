import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../config/env.js";
import { EmailDeliveryError, sendEmail } from "../email/mailer.js";
import { renderSignInCodeEmail } from "../email/templates.js";

// The real Resend call can't run in CI without a key, so this pins the request
// we'd send (URL, auth header, payload) and how each kind of failure surfaces.
type Mutable = { EMAIL_TRANSPORT: string; RESEND_API_KEY: string; EMAIL_FROM: string };
const mutableEnv = env as unknown as Mutable;
const original = { ...mutableEnv };

const mail = { to: "ada@example.com", subject: "Your CollabNotes sign-in code", html: "<p>482913</p>", text: "482913" };

describe("Resend transport", () => {
  beforeEach(() => {
    mutableEnv.EMAIL_TRANSPORT = "resend";
    mutableEnv.RESEND_API_KEY = "re_test_key";
    mutableEnv.EMAIL_FROM = "CollabNotes <auth@example.com>";
  });
  afterEach(() => {
    Object.assign(mutableEnv, original);
    vi.unstubAllGlobals();
  });

  it("POSTs the message to Resend with the bearer key, sender and both bodies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "abc" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail(mail);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer re_test_key");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      from: "CollabNotes <auth@example.com>",
      to: ["ada@example.com"],
      subject: "Your CollabNotes sign-in code",
      html: "<p>482913</p>",
      text: "482913",
    });
    expect(typeof body.headers["X-Entity-Ref-ID"]).toBe("string");
    expect(init.signal).toBeInstanceOf(AbortSignal); // a stuck provider can't hang the request
  });

  it("surfaces a provider rejection (bad key, unverified domain, quota) as a delivery error", async () => {
    // A fresh Response per call: a body can only be read once.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        async () =>
          new Response(JSON.stringify({ message: "You can only send testing emails to your own email address" }), { status: 403 }),
      ),
    );
    await expect(sendEmail(mail)).rejects.toThrow(EmailDeliveryError);
    await expect(sendEmail(mail)).rejects.toThrow(/403.*testing emails/);
  });

  it("surfaces a network failure or timeout as an error too", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    await expect(sendEmail(mail)).rejects.toThrow();
  });

  it("refuses to run without an API key, and never calls the network", async () => {
    mutableEnv.RESEND_API_KEY = "";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendEmail(mail)).rejects.toThrow(/RESEND_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sign-in email template", () => {
  const input = {
    code: "482913",
    email: "ada@example.com",
    expiresInMinutes: 10,
    appUrl: "https://collabnotes.example",
    requestedAt: new Date("2026-09-21T06:14:00Z"),
  };

  it("contains the code, the address and the expiry in both the HTML and plain-text parts", () => {
    const { subject, html, text } = renderSignInCodeEmail(input);
    expect(subject).toBe("Your CollabNotes sign-in code");
    for (const part of [html, text]) {
      expect(part).toContain("482913");
      expect(part).toContain("ada@example.com");
      expect(part).toContain("10 minutes");
    }
  });

  it("has nothing to phish with: no links or remote images in the HTML", () => {
    const { html } = renderSignInCodeEmail(input);
    expect(html).not.toMatch(/<a\s/i);
    expect(html).not.toMatch(/<img\s/i);
    expect(html).not.toMatch(/href=/i);
  });

  it("escapes anything user-supplied that lands in the HTML", () => {
    const { html } = renderSignInCodeEmail({ ...input, email: `"><script>alert(1)</script>@evil.test` });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("declares dark-mode support and a hidden preheader", () => {
    const { html } = renderSignInCodeEmail(input);
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("482913 is your sign-in code");
  });
});
