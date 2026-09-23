import { beforeEach, describe, expect, it } from "vitest";
import { consumeGoogleState } from "./googleOAuth.js";

const KEY = "collabnotes.oauthState";

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as { sessionStorage?: Storage }).sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as Storage;
});

const remember = (state: string, redirect: string) =>
  sessionStorage.setItem(KEY, JSON.stringify({ state, redirect }));

describe("consumeGoogleState", () => {
  it("accepts the state this browser minted and returns where to go next", () => {
    remember("abc123", "/documents/42");
    expect(consumeGoogleState("abc123")).toEqual({ redirect: "/documents/42" });
  });

  it("is single use: a replayed callback is refused", () => {
    remember("abc123", "/");
    expect(consumeGoogleState("abc123")).not.toBeNull();
    expect(consumeGoogleState("abc123")).toBeNull();
  });

  it("refuses a state that doesn't match, and burns the stored one", () => {
    remember("abc123", "/");
    expect(consumeGoogleState("forged")).toBeNull();
    expect(consumeGoogleState("abc123")).toBeNull();
  });

  it("refuses a callback with no state, or when this browser never started a sign-in", () => {
    remember("abc123", "/");
    expect(consumeGoogleState(null)).toBeNull();
    expect(consumeGoogleState("abc123")).toBeNull();
    expect(consumeGoogleState("anything")).toBeNull();
  });

  it("re-validates the stored redirect, so tampered storage can't cause an open redirect", () => {
    remember("abc123", "//evil.example");
    expect(consumeGoogleState("abc123")).toEqual({ redirect: "/" });
    remember("def456", "/\\evil.example");
    expect(consumeGoogleState("def456")).toEqual({ redirect: "/" });
  });

  it("refuses garbage in storage rather than throwing", () => {
    sessionStorage.setItem(KEY, "{not json");
    expect(consumeGoogleState("abc123")).toBeNull();
  });
});
