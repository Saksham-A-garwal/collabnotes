import { OAuth2Client } from "google-auth-library";
import { afterEach, describe, expect, it, vi } from "vitest";

// Google sign-in can't be exercised end to end without real credentials, so
// this pins the seam we depend on: the OAuth2Client calls exchangeGoogleCode
// makes (constructor options, getToken, verifyIdToken/getPayload) and how it
// maps their results and failures. spyOn throws if a method disappears, which
// is what a major google-auth-library upgrade would break.
vi.mock("../../../config/env.js", () => ({
  env: { GOOGLE_CLIENT_ID: "client-id", GOOGLE_CLIENT_SECRET: "client-secret", GOOGLE_REDIRECT_URI: "http://localhost/cb" },
}));

const { exchangeGoogleCode } = await import("../google.service.js");

const getToken = () => vi.spyOn(OAuth2Client.prototype, "getToken") as unknown as ReturnType<typeof vi.fn>;
const verifyIdToken = () => vi.spyOn(OAuth2Client.prototype, "verifyIdToken") as unknown as ReturnType<typeof vi.fn>;
const ticketFor = (payload: object | undefined) => ({ getPayload: () => payload });

afterEach(() => vi.restoreAllMocks());

describe("exchangeGoogleCode", () => {
  it("exchanges the code, verifies the id token for our audience, and maps the profile", async () => {
    const tokenSpy = getToken().mockResolvedValue({ tokens: { id_token: "the-id-token" } });
    const verifySpy = verifyIdToken().mockResolvedValue(
      ticketFor({ email: "ada@example.com", email_verified: true, name: "Ada Lovelace", picture: "https://img/ada.png", sub: "google-uid-1" }),
    );

    await expect(exchangeGoogleCode("auth-code")).resolves.toEqual({
      email: "ada@example.com",
      displayName: "Ada Lovelace",
      avatarUrl: "https://img/ada.png",
      googleUid: "google-uid-1",
    });
    expect(tokenSpy).toHaveBeenCalledWith("auth-code");
    expect(verifySpy).toHaveBeenCalledWith({ idToken: "the-id-token", audience: "client-id" });
  });

  it("falls back to the email's local part when Google sends no name or picture", async () => {
    getToken().mockResolvedValue({ tokens: { id_token: "t" } });
    verifyIdToken().mockResolvedValue(ticketFor({ email: "grace@example.com", email_verified: true, sub: "uid-2" }));

    await expect(exchangeGoogleCode("c")).resolves.toMatchObject({ displayName: "grace", avatarUrl: null });
  });

  it("turns a rejected code exchange into a validation error, not a 500", async () => {
    getToken().mockRejectedValue(new Error("invalid_grant"));
    await expect(exchangeGoogleCode("bad")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a response with no id token", async () => {
    getToken().mockResolvedValue({ tokens: {} });
    await expect(exchangeGoogleCode("c")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects an unverified Google email — accounts are matched by email, so it would allow takeover", async () => {
    getToken().mockResolvedValue({ tokens: { id_token: "t" } });
    verifyIdToken().mockResolvedValue(ticketFor({ email: "victim@example.com", email_verified: false, sub: "uid-x" }));
    await expect(exchangeGoogleCode("c")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a Google account with no email", async () => {
    getToken().mockResolvedValue({ tokens: { id_token: "t" } });
    verifyIdToken().mockResolvedValue(ticketFor({ sub: "uid-3" }));
    await expect(exchangeGoogleCode("c")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
