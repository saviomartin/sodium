import { describe, expect, it } from "vitest";
import {
  compileSodiumConfig,
  resolveInput,
  validateSodiumConfig,
} from "../src";

const config = {
  schemaVersion: 1,
  app: { name: "Fixture shop", origins: ["https://shop.example"] },
  tools: [
    {
      id: "tl_abcdefgh",
      name: "open_product",
      description: "Open one product using its stable product identifier.",
      input: { id: "string" },
      on: ["/products/**"],
      run: { navigate: "/products/{id}" },
      risk: "read_only",
    },
  ],
};

describe("sodium.json", () => {
  it("turns the friendly authoring format into a closed WebMCP contract", () => {
    expect(compileSodiumConfig(config).tools[0]).toMatchObject({
      id: "tl_abcdefgh",
      title: "Open product",
      inputSchema: {
        type: "object",
        required: ["id"],
        additionalProperties: false,
      },
      handler: { kind: "navigate", urlTemplate: "/products/{id}" },
    });
  });

  it("makes fields required by default and supports optional fields", () => {
    expect(
      resolveInput({ q: "string", limit: { type: "integer", optional: true } }),
    ).toEqual({
      type: "object",
      properties: { q: { type: "string" }, limit: { type: "integer" } },
      required: ["q"],
      additionalProperties: false,
    });
  });

  it("rejects duplicate names and mismatched risk", () => {
    const bad = structuredClone(config);
    bad.tools.push({
      ...bad.tools[0]!,
      id: "tl_bcdefghi",
      run: { navigate: "/different/{id}" },
      risk: "state_changing",
    });
    const result = validateSodiumConfig(bad);
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["duplicate_name", "risk_mismatch"]),
    );
  });
});
