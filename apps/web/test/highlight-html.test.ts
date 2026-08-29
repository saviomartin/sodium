import { describe, expect, it } from "vitest";
import { tokenizeHtml } from "../lib/highlight-html";

const rebuild = (source: string) =>
  tokenizeHtml(source)
    .map((token) => token.text)
    .join("");

describe("tokenizeHtml", () => {
  it("keeps the source intact", () => {
    const snippet =
      '<script src="https://example.com/agent/v1.js" data-site="site_abc"></script>';
    expect(rebuild(snippet)).toBe(snippet);
  });

  it("separates tag names, attributes, and quoted values", () => {
    const tokens = tokenizeHtml('<script src="/a.js" defer></script>');
    expect(tokens.filter((token) => token.kind === "name")).toEqual([
      { kind: "name", text: "script" },
      { kind: "name", text: "script" },
    ]);
    expect(tokens.filter((token) => token.kind === "attribute")).toEqual([
      { kind: "attribute", text: "src" },
      { kind: "attribute", text: "defer" },
    ]);
    expect(tokens.filter((token) => token.kind === "string")).toEqual([
      { kind: "string", text: '"/a.js"' },
    ]);
  });

  it("handles comments, self-closing tags, and stray angle brackets", () => {
    for (const source of [
      "<!-- install the loader -->",
      '<link rel="preload" href="/a.js" />',
      "5 < 6 and 7 > 6",
      "<script src='unterminated",
    ]) {
      expect(rebuild(source)).toBe(source);
    }
    expect(tokenizeHtml("<!-- hi -->")).toEqual([
      { kind: "comment", text: "<!-- hi -->" },
    ]);
  });

  it("returns nothing for an empty snippet", () => {
    expect(tokenizeHtml("")).toEqual([]);
  });
});
