import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { parseRelativePosition } from "./commentAnchorCodec.js";

describe("parseRelativePosition", () => {
  it("accepts what Yjs itself produced", () => {
    const doc = new Y.Doc();
    const text = doc.getXmlFragment("default");
    const para = new Y.XmlElement("paragraph");
    text.insert(0, [para]);
    const run = new Y.XmlText("hello");
    para.insert(0, [run]);

    const json = Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(run, 3, -1));
    const parsed = parseRelativePosition(json, "default");
    expect(parsed).not.toBeNull();
    const abs = Y.createAbsolutePositionFromRelativePosition(parsed!, doc);
    expect(abs?.index).toBe(3);
  });

  it("accepts a position at the very start of the fragment", () => {
    const json = Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(new Y.Doc().getXmlFragment("default"), 0, -1));
    expect(parseRelativePosition(json, "default")).not.toBeNull();
  });

  it("rejects anything that isn't an object", () => {
    for (const bad of [null, undefined, 5, "text", true, [], [1, 2]]) {
      expect(parseRelativePosition(bad, "default")).toBeNull();
    }
  });

  it("rejects a type name other than the editor's fragment (Yjs would create a root type of that name)", () => {
    const doc = new Y.Doc();
    expect(parseRelativePosition({ type: null, tname: "evil", item: null, assoc: 0 }, "default")).toBeNull();
    expect(parseRelativePosition({ type: null, tname: "__proto__", item: null, assoc: 0 }, "default")).toBeNull();
    expect(parseRelativePosition({ type: null, tname: 7, item: null, assoc: 0 }, "default")).toBeNull();
    expect(Array.from(doc.share.keys())).toEqual([]);
  });

  it("rejects ids that aren't plain non-negative integers", () => {
    const bad = [
      { type: { client: "1", clock: 2 }, tname: null, item: null, assoc: 0 },
      { type: null, tname: null, item: { client: 1, clock: -1 }, assoc: 0 },
      { type: null, tname: null, item: { client: 1.5, clock: 1 }, assoc: 0 },
      { type: null, tname: null, item: { client: Number.MAX_VALUE, clock: 1 }, assoc: 0 },
      { type: null, tname: null, item: 5, assoc: 0 },
      { type: {}, tname: null, item: null, assoc: 0 },
    ];
    for (const json of bad) expect(parseRelativePosition(json, "default")).toBeNull();
  });

  it("rejects a non-numeric or infinite assoc", () => {
    expect(parseRelativePosition({ type: null, tname: "default", item: null, assoc: "left" }, "default")).toBeNull();
    expect(parseRelativePosition({ type: null, tname: "default", item: null, assoc: Infinity }, "default")).toBeNull();
  });

  it("rejects an empty position that points at nothing", () => {
    expect(parseRelativePosition({}, "default")).toBeNull();
    expect(parseRelativePosition({ type: null, tname: null, item: null, assoc: 0 }, "default")).toBeNull();
  });

  it("a well-formed position for text that doesn't exist resolves to nothing, not an error", () => {
    const parsed = parseRelativePosition({ type: null, tname: null, item: { client: 424242, clock: 9 }, assoc: -1 }, "default");
    expect(parsed).not.toBeNull();
    expect(Y.createAbsolutePositionFromRelativePosition(parsed!, new Y.Doc())).toBeNull();
  });
});
