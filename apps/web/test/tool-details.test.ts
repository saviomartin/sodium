import { describe, expect, it } from "vitest";
import type { SodiumTool } from "sodium-webmcp-spec";
import { describeHandler, toolDetails } from "../lib/tool-details";
import type { ToolRollup } from "../lib/tool-analytics";

const tool = (overrides: Partial<SodiumTool> = {}): SodiumTool =>
  ({
    id: "tl_search001",
    name: "search_products",
    description: "Searches the catalogue for matching products.",
    input: { q: "string" },
    on: ["/shop/**"],
    run: { navigate: "/shop?q={q}" },
    risk: "read_only",
    ...overrides,
  }) as SodiumTool;

const rollup = (overrides: Partial<ToolRollup> = {}): ToolRollup => ({
  id: "tl_search001",
  name: "search_products",
  title: "Search products",
  risk: "read_only",
  calls: 12,
  successes: 11,
  failures: 1,
  denied: 0,
  successRate: 11 / 12,
  p95Ms: 240,
  daily: [],
  ...overrides,
});

describe("describeHandler", () => {
  it("names every mechanism sodium.json can declare", () => {
    expect(
      describeHandler({ kind: "navigate", urlTemplate: "/checkout" }),
    ).toMatchObject({ kind: "navigate" });
    expect(
      describeHandler({
        kind: "request",
        method: "POST",
        pathTemplate: "/api/cart",
        response: "json",
      }),
    ).toEqual({ kind: "request", summary: "POST /api/cart" });
    expect(describeHandler({ kind: "call", export: "addToCart" })).toEqual({
      kind: "call",
      summary: "your addToCart export",
    });
  });

  it("counts steps and fields in the singular when there is one", () => {
    expect(
      describeHandler({
        kind: "extract",
        fields: [{ name: "price", selector: ".price" }],
      }).summary,
    ).toBe("1 field off the page");
  });
});

describe("toolDetails", () => {
  it("derives title, routes, confirmation floor, and input schema", () => {
    const [detail] = toolDetails([tool()], []);
    expect(detail).toMatchObject({
      id: "tl_search001",
      name: "search_products",
      title: "Search products",
      risk: "read_only",
      // read_only's floor is `none`, and the tool declares nothing.
      confirmation: "none",
      routes: [{ pattern: "/shop/**" }],
      run: { kind: "navigate" },
    });
    expect(detail?.input).toMatchObject({
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
    });
  });

  it("raises the confirmation floor with risk", () => {
    const [detail] = toolDetails([tool({ risk: "financial" })], []);
    expect(detail?.confirmation).toBe("required");
  });

  it("keeps a deployed tool that telemetry never saw, at zero", () => {
    const [detail] = toolDetails([tool()], []);
    expect(detail?.stats).toEqual({
      calls: 0,
      successes: 0,
      failures: 0,
      denied: 0,
      successRate: null,
      p95Ms: null,
    });
  });

  it("joins measurements onto the contract by tool id", () => {
    const [detail] = toolDetails([tool()], [rollup()]);
    expect(detail?.stats).toMatchObject({ calls: 12, p95Ms: 240 });
  });

  it("carries a route's selector condition through", () => {
    const [detail] = toolDetails(
      [tool({ on: [{ path: "/app/**", when: "[data-signed-in]" }] })],
      [],
    );
    expect(detail?.routes).toEqual([
      { pattern: "/app/**", when: "[data-signed-in]" },
    ]);
  });
});
