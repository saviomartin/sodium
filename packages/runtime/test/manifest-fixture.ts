import type { PublishedTool, ToolManifest } from "../src/types";

export function makeTool(
  overrides: Partial<PublishedTool> = {},
): PublishedTool {
  return {
    name: "list_products",
    title: "List products",
    description: "Reads the visible product catalog from the products page.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    riskLevel: "read_only",
    confirmation: "none",
    routes: [{ pathPattern: "/products" }],
    handler: {
      kind: "extract",
      fields: [
        { name: "products", selector: "[data-product-name]", all: true },
      ],
    },
    ...overrides,
  };
}

export function makeManifest(
  overrides: Partial<ToolManifest> = {},
): ToolManifest {
  return {
    manifestVersion: 1,
    siteId: "site_abcd1234efgh",
    origins: ["http://localhost:4000"],
    version: 1,
    generatedAt: "2026-08-28T00:00:00.000Z",
    tools: [makeTool()],
    ...overrides,
  };
}
