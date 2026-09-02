import { describe, expect, it } from "vitest";
import { tokenizeJson } from "../lib/highlight-json";

const rebuild = (source: string) =>
  tokenizeJson(source)
    .map((token) => token.text)
    .join("");

describe("tokenizeJson", () => {
  it("keeps the source intact", () => {
    const snippet = JSON.stringify(
      { name: "search_products", on: ["/shop/**"], risk: "read_only" },
      null,
      2,
    );
    expect(rebuild(snippet)).toBe(snippet);
  });

  it("tells a field name apart from a string value", () => {
    const tokens = tokenizeJson('{"risk": "read_only"}');
    expect(tokens.filter((token) => token.kind === "key")).toEqual([
      { kind: "key", text: '"risk"' },
    ]);
    expect(tokens.filter((token) => token.kind === "string")).toEqual([
      { kind: "string", text: '"read_only"' },
    ]);
  });

  it("names a key across the newline a pretty-printer puts before the colon", () => {
    const tokens = tokenizeJson('{"name"\n  : 1}');
    expect(tokens[1]).toEqual({ kind: "key", text: '"name"' });
  });

  it("separates numbers, keywords, and punctuation", () => {
    const tokens = tokenizeJson('{"a": -1.5e3, "b": true, "c": null}');
    expect(tokens.filter((token) => token.kind === "number")).toEqual([
      { kind: "number", text: "-1.5e3" },
    ]);
    expect(
      tokens.filter((token) => token.kind === "keyword").map((t) => t.text),
    ).toEqual(["true", "null"]);
  });

  it("survives escapes and an unterminated string", () => {
    for (const source of [
      '{"path": "C:\\\\tmp\\"x\\""}',
      '{"quote": "he said \\"hi\\""}',
      '{"open": "unterminated',
      "",
      "[]",
    ]) {
      expect(rebuild(source)).toBe(source);
    }
  });

  it("returns nothing for an empty snippet", () => {
    expect(tokenizeJson("")).toEqual([]);
  });
});
