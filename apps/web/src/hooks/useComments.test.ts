import { describe, expect, it } from "vitest";
import type { CommentThreadDTO } from "@collabnotes/shared";
import { upsertThread } from "./useComments.js";

const thread = (id: string, createdAt: string, extra: Partial<CommentThreadDTO> = {}): CommentThreadDTO => ({
  id,
  documentId: "d",
  author: { id: "u", displayName: "U" },
  quote: "q",
  anchor: null,
  createdAt,
  resolvedAt: null,
  resolvedBy: null,
  comments: [],
  ...extra,
});

describe("upsertThread", () => {
  it("adds a thread we haven't seen, keeping oldest first", () => {
    const list = [thread("a", "2026-01-01T10:00:00Z"), thread("c", "2026-01-01T12:00:00Z")];
    expect(upsertThread(list, thread("b", "2026-01-01T11:00:00Z")).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("replaces a thread we already have, so applying the same change twice is harmless", () => {
    const list = [thread("a", "2026-01-01T10:00:00Z")];
    const resolved = thread("a", "2026-01-01T10:00:00Z", { resolvedAt: "2026-01-02T00:00:00Z" });
    const once = upsertThread(list, resolved);
    const twice = upsertThread(once, resolved);
    expect(twice).toHaveLength(1);
    expect(twice[0]!.resolvedAt).not.toBeNull();
  });

  it("doesn't modify the list it was given", () => {
    const list = [thread("a", "2026-01-01T10:00:00Z")];
    const copy = [...list];
    upsertThread(list, thread("b", "2026-01-01T11:00:00Z"));
    expect(list).toEqual(copy);
  });
});
