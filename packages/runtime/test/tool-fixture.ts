import type { CompiledTool } from "sodium-webmcp-spec";

export function makeTool(overrides: Partial<CompiledTool> = {}): CompiledTool {
  return {
    id: "tl_abcdefgh",
    name: "open_products",
    title: "Open products",
    description: "Open the products page for the current application.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    routes: [{ pathPattern: "/**" }],
    handler: { kind: "navigate", urlTemplate: "/products" },
    riskLevel: "read_only",
    confirmation: "none",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    ...overrides,
  };
}
