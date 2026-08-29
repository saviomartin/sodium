import { describe, expect, it } from "vitest";
import { compareManifestToAnalysis } from "../src/pipeline/sync";
import { annotationsForRisk, type ToolManifest } from "@sodium/contracts";
import type { StaticAnalysis } from "@sodium/analyzer";

function analysis(overrides: Partial<StaticAnalysis> = {}): StaticAnalysis {
  return {
    framework: "nextjs",
    appDir: "app",
    routes: [
      {
        urlPattern: "/products",
        pathPattern: "/products",
        kind: "page",
        span: { filePath: "app/products/page.tsx", startLine: 1, endLine: 10 },
        params: [],
      },
      {
        urlPattern: "/contact",
        pathPattern: "/contact",
        kind: "page",
        span: { filePath: "app/contact/page.tsx", startLine: 1, endLine: 10 },
        params: [],
      },
    ],
    serverActions: [
      {
        name: "cancelOrder",
        span: { filePath: "app/actions.ts", startLine: 1, endLine: 10 },
        params: ["input"],
        takesFormData: false,
        authSignals: [],
        excerpt: "",
      },
    ],
    routeHandlers: [],
    forms: [
      {
        span: { filePath: "app/contact/page.tsx", startLine: 5, endLine: 20 },
        urlPattern: "/contact",
        pathPattern: "/contact",
        fields: [
          { name: "email", type: "email", required: true },
          { name: "message", type: "textarea", required: true },
        ],
        action: { kind: "server_action", name: "submitContact" },
        excerpt: "",
      },
    ],
    links: [],
    zodSchemas: [],
    authSignals: [],
    warnings: [],
    stats: { filesScanned: 0, filesSkipped: 0, bytesRead: 0 },
    ...overrides,
  };
}

function manifest(): ToolManifest {
  return {
    manifestVersion: 1,
    siteId: "site_fixtureshop01",
    origins: ["http://localhost:4000"],
    version: 1,
    generatedAt: new Date().toISOString(),
    tools: [
      {
        name: "open_products",
        title: "Open products",
        description: "Navigates to the products listing page.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false,
        },
        annotations: annotationsForRisk("read_only"),
        riskLevel: "read_only",
        confirmation: "none",
        routes: [{ pathPattern: "/**" }],
        handler: { kind: "navigate", urlTemplate: "/products" },
      },
      {
        name: "submit_contact",
        title: "Submit contact form",
        description: "Submits the contact form with email and message fields.",
        inputSchema: {
          type: "object",
          properties: {
            email: { type: "string" },
            message: { type: "string" },
          },
          required: ["email", "message"],
          additionalProperties: false,
        },
        annotations: annotationsForRisk("state_changing"),
        riskLevel: "state_changing",
        confirmation: "recommended",
        routes: [{ pathPattern: "/contact" }],
        handler: {
          kind: "form",
          formSelector: "form",
          fieldMap: { email: "email", message: "message" },
        },
      },
      {
        name: "cancel_order",
        title: "Cancel an order",
        description:
          "Cancels a pending order through the application's own action.",
        inputSchema: {
          type: "object",
          properties: { orderId: { type: "string" } },
          required: ["orderId"],
          additionalProperties: false,
        },
        annotations: annotationsForRisk("destructive"),
        riskLevel: "destructive",
        confirmation: "required",
        routes: [{ pathPattern: "/**" }],
        handler: { kind: "bridge", bridgeKey: "actions.cancel_order" },
      },
    ],
  };
}

describe("compareManifestToAnalysis", () => {
  it("reports no findings when nothing changed", () => {
    expect(compareManifestToAnalysis(manifest(), analysis())).toEqual([]);
  });

  it("flags removed navigation targets as breaking", () => {
    const changed = analysis({
      routes: analysis().routes.filter((r) => r.urlPattern !== "/products"),
    });
    const findings = compareManifestToAnalysis(manifest(), changed);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "handler_removed",
        severity: "breaking",
        toolName: "open_products",
      }),
    );
  });

  it("keeps navigation valid when its source is a literal application link", () => {
    const changed = analysis({
      routes: analysis().routes.filter(
        (route) => route.urlPattern !== "/products",
      ),
      links: [
        {
          href: "/products?from=home",
          label: "Browse products",
          routeBindings: [{ urlPattern: "/", pathPattern: "/" }],
          span: { filePath: "app/page.tsx", startLine: 5, endLine: 5 },
          excerpt: '<Link href="/products?from=home">Browse products</Link>',
        },
      ],
    });
    const findings = compareManifestToAnalysis(manifest(), changed);

    expect(
      findings.some((finding) => finding.toolName === "open_products"),
    ).toBe(false);
  });

  it("flags renamed form fields as input_changed", () => {
    const base = analysis();
    base.forms[0]!.fields = [
      { name: "email_address", type: "email", required: true },
      { name: "message", type: "textarea", required: true },
    ];
    const findings = compareManifestToAnalysis(manifest(), base);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "input_changed",
        severity: "breaking",
        toolName: "submit_contact",
      }),
    );
  });

  it("flags removed server actions behind bridge keys", () => {
    const changed = analysis({ serverActions: [] });
    const findings = compareManifestToAnalysis(manifest(), changed);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "handler_removed",
        severity: "breaking",
        toolName: "cancel_order",
      }),
    );
  });

  it("flags a fully removed form as breaking", () => {
    const changed = analysis({ forms: [] });
    const findings = compareManifestToAnalysis(manifest(), changed);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "handler_removed",
        toolName: "submit_contact",
      }),
    );
  });
});
