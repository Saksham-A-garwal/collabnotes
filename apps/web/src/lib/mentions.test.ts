import { describe, expect, it } from "vitest";
import { activeMentionQuery, insertMention, matchPeople, mentionedIds, splitMentions } from "./mentions.js";

const people = [
  { id: "1", displayName: "Ada Lovelace" },
  { id: "2", displayName: "Grace Hopper" },
  { id: "3", displayName: "Adam Smith" },
  { id: "4", displayName: "Lin Ada" },
];

describe("activeMentionQuery", () => {
  it("opens at the start of the text and after whitespace", () => {
    expect(activeMentionQuery("@gr", 3)).toEqual({ start: 0, query: "gr" });
    expect(activeMentionQuery("hello @", 7)).toEqual({ start: 6, query: "" });
    expect(activeMentionQuery("a\n@Gra", 6)).toEqual({ start: 2, query: "Gra" });
  });

  it("stays closed for an email address or an @ inside a word", () => {
    expect(activeMentionQuery("write to ada@example.com", 24)).toBeNull();
    expect(activeMentionQuery("no at sign", 5)).toBeNull();
  });

  it("looks only at the text before the caret", () => {
    expect(activeMentionQuery("hi @gr and more", 6)).toEqual({ start: 3, query: "gr" });
  });

  it("closes once the query runs across a new line or gets too long", () => {
    expect(activeMentionQuery("@gr\nace", 7)).toBeNull();
    expect(activeMentionQuery("@" + "x".repeat(31), 32)).toBeNull();
  });
});

describe("matchPeople", () => {
  it("puts names that start with the query first, then words, then substrings", () => {
    expect(matchPeople(people, "ad").map((p) => p.displayName)).toEqual(["Ada Lovelace", "Adam Smith", "Lin Ada"]);
  });

  it("ignores case and returns everyone (up to a limit) for an empty query", () => {
    expect(matchPeople(people, "GRACE")).toEqual([people[1]]);
    expect(matchPeople(people, "")).toHaveLength(4);
    const many = Array.from({ length: 20 }, (_, i) => ({ id: String(i), displayName: `Person ${i}` }));
    expect(matchPeople(many, "")).toHaveLength(6);
  });

  it("returns nothing when nobody matches", () => {
    expect(matchPeople(people, "zzz")).toEqual([]);
  });
});

describe("insertMention", () => {
  it("replaces what was typed with the full name and a space, and moves the caret past it", () => {
    expect(insertMention("Hi @gr, thanks", 3, 6, people[1]!)).toEqual({ text: "Hi @Grace Hopper , thanks", caret: 17 });
  });
});

describe("mentionedIds", () => {
  const chosen = new Map([
    ["1", "Ada Lovelace"],
    ["2", "Grace Hopper"],
  ]);

  it("keeps the people still named in the text", () => {
    expect(mentionedIds("cc @Ada Lovelace and @Grace Hopper", chosen)).toEqual(["1", "2"]);
  });

  it("drops a person whose name was deleted or changed", () => {
    expect(mentionedIds("cc @Ada Lovelace", chosen)).toEqual(["1"]);
    expect(mentionedIds("cc @Grace Hop", chosen)).toEqual([]);
  });

  it("doesn't count a longer name that merely starts the same", () => {
    expect(mentionedIds("cc @Ada Lovelaceish", chosen)).toEqual([]);
  });

  it("copes with punctuation after the name and with regex characters in names", () => {
    expect(mentionedIds("thanks, @Ada Lovelace!", chosen)).toEqual(["1"]);
    expect(mentionedIds("hi @A.(B)+", new Map([["9", "A.(B)+"]]))).toEqual(["9"]);
  });
});

describe("splitMentions", () => {
  it("cuts the text around each mention", () => {
    expect(splitMentions("ask @Ada Lovelace, then @Grace Hopper.", ["Ada Lovelace", "Grace Hopper"])).toEqual([
      { text: "ask ", mention: false },
      { text: "@Ada Lovelace", mention: true },
      { text: ", then ", mention: false },
      { text: "@Grace Hopper", mention: true },
      { text: ".", mention: false },
    ]);
  });

  it("returns the text unchanged when there is nobody to highlight", () => {
    expect(splitMentions("plain <b>text</b>", [])).toEqual([{ text: "plain <b>text</b>", mention: false }]);
  });

  it("prefers the longest name when one is a prefix of another", () => {
    expect(splitMentions("@Ada Lovelace", ["Ada", "Ada Lovelace"])).toEqual([{ text: "@Ada Lovelace", mention: true }]);
  });
});
