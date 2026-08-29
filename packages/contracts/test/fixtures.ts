import type { ActionContract, ToolManifest } from "../src/index";
import { annotationsForRisk } from "../src/index";

export function makeContract(
  overrides: Partial<ActionContract> = {},
): ActionContract {
  return {
    contractVersion: 2,
    actionId: "act_0123456789abcdef",
    name: "list_products",
    title: "List products",
    description: "Reads the visible product catalog from the products page.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    output: {
      description: "Array of product names and prices.",
      schema: {
        type: "object",
        properties: {
          ok: { type: "boolean", const: true },
          data: { type: "object", additionalProperties: true },
        },
        required: ["ok", "data"],
        additionalProperties: false,
      },
    },
    evidence: [
      {
        kind: "source",
        primitive: "route",
        filePath: "app/products/page.tsx",
        startLine: 1,
        endLine: 40,
        snippetSha256: "a".repeat(64),
        excerpt: "export default async function ProductsPage() { ... }",
        summary: "Products listing route",
      },
    ],
    routes: [{ pathPattern: "/products" }],
    auth: { required: false, roles: [] },
    riskLevel: "read_only",
    confirmation: "none",
    handler: {
      kind: "extract",
      fields: [
        { name: "products", selector: "[data-product-name]", all: true },
      ],
    },
    confidence: 0.8,
    ...overrides,
  };
}

export function makeManifest(
  overrides: Partial<ToolManifest> = {},
): ToolManifest {
  const contract = makeContract();
  return {
    manifestVersion: 2,
    siteId: "site_abcd1234efgh",
    origins: ["http://localhost:4000"],
    version: 1,
    generatedAt: new Date("2026-08-28T00:00:00Z").toISOString(),
    tools: [
      {
        name: contract.name,
        title: contract.title,
        description: contract.description,
        inputSchema: contract.inputSchema,
        annotations: annotationsForRisk(contract.riskLevel),
        riskLevel: contract.riskLevel,
        confirmation: contract.confirmation,
        routes: contract.routes,
        handler: contract.handler,
      },
    ],
    ...overrides,
  };
}
