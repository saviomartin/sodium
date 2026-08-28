import { describe, expect, it } from "vitest";
import { fillUrlTemplate, matchesPathPattern } from "../src/matcher";
import { validateInput } from "../src/validate-input";
import { validateValue, type JsonSchemaSubset } from "@sodium/contracts";

describe("matchesPathPattern", () => {
  it("matches literals, wildcards and catch-alls", () => {
    expect(matchesPathPattern("/", "/")).toBe(true);
    expect(matchesPathPattern("/products", "/products")).toBe(true);
    expect(matchesPathPattern("/products", "/products/")).toBe(true);
    expect(matchesPathPattern("/products", "/orders")).toBe(false);
    expect(matchesPathPattern("/products/*", "/products/abc")).toBe(true);
    expect(matchesPathPattern("/products/*", "/products")).toBe(false);
    expect(matchesPathPattern("/products/*", "/products/a/b")).toBe(false);
    expect(matchesPathPattern("/docs/**", "/docs")).toBe(true);
    expect(matchesPathPattern("/docs/**", "/docs/a/b/c")).toBe(true);
    expect(matchesPathPattern("/**", "/anything/at/all")).toBe(true);
  });
});

describe("fillUrlTemplate", () => {
  it("fills and encodes params", () => {
    expect(fillUrlTemplate("/orders/{id}", { id: "abc 123" })).toBe(
      "/orders/abc%20123",
    );
  });
  it("fails on missing params", () => {
    expect(fillUrlTemplate("/orders/{id}", {})).toBeNull();
  });
  it("refuses templates escaping the origin", () => {
    expect(fillUrlTemplate("/{path}", { path: "/evil.example/x" })).toBe(
      "/%2Fevil.example%2Fx",
    );
    expect(fillUrlTemplate("//{host}", { host: "evil.example" })).toBeNull();
  });
});

describe("validateInput cross-check with @sodium/contracts validateValue", () => {
  const schema: JsonSchemaSubset = {
    type: "object",
    properties: {
      email: { type: "string", pattern: "^.+@.+$", maxLength: 50 },
      qty: { type: "integer", minimum: 1, maximum: 10 },
      kind: { type: "string", enum: ["a", "b"] },
      flag: { type: "boolean" },
      tags: { type: "array", items: { type: "string", minLength: 1 } },
    },
    required: ["email", "qty"],
    additionalProperties: false,
  };

  const cases: unknown[] = [
    { email: "a@b.c", qty: 3 },
    { email: "a@b.c", qty: 3, kind: "a", flag: true, tags: ["x"] },
    { qty: 3 },
    { email: "nope", qty: 3 },
    { email: "a@b.c", qty: 0 },
    { email: "a@b.c", qty: 3.5 },
    { email: "a@b.c", qty: 3, kind: "z" },
    { email: "a@b.c", qty: 3, extra: 1 },
    { email: "a@b.c", qty: 3, tags: [""] },
    "not an object",
    null,
  ];

  it("agrees with the server-side validator on every case", () => {
    for (const value of cases) {
      const runtimeVerdict = validateInput(schema, value).length === 0;
      const contractsVerdict = validateValue(schema, value).length === 0;
      expect(runtimeVerdict, JSON.stringify(value)).toBe(contractsVerdict);
    }
  });
});
