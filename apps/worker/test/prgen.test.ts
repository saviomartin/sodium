import { describe, expect, it } from "vitest";
import {
  editLayout,
  generateBridgeModule,
  generateIntegration,
} from "../src/prgen/generator";
import type { ActionContract } from "@sodium/contracts";

const cancelOrder: ActionContract = {
  contractVersion: 1,
  actionId: "act_0123456789abcdef",
  name: "cancel_order",
  title: "Cancel an order",
  description:
    "Cancels a pending order for the signed-in customer after explicit confirmation.",
  inputSchema: {
    type: "object",
    properties: { orderId: { type: "string" } },
    required: ["orderId"],
    additionalProperties: false,
  },
  output: { description: "Cancellation result." },
  evidence: [
    {
      kind: "source",
      primitive: "server_action",
      filePath: "app/actions.ts",
      startLine: 10,
      endLine: 20,
      snippetSha256: "a".repeat(64),
      excerpt: "export async function cancelOrder(...)",
      summary: "cancelOrder server action",
    },
  ],
  routes: [{ pathPattern: "/**" }],
  auth: { required: true, roles: [] },
  riskLevel: "destructive",
  confirmation: "required",
  handler: { kind: "bridge", bridgeKey: "actions.cancel_order" },
  confidence: 0.8,
};

const LAYOUT = `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
`;

describe("generateBridgeModule", () => {
  it("imports the customer's own server action and binds it", () => {
    const source = generateBridgeModule([cancelOrder]);
    expect(source).toContain('import { cancelOrder } from "../app/actions"');
    expect(source).toContain('"actions.cancel_order"');
    expect(source).toContain("@generated");
    expect(source).not.toContain("eval(");
  });
});

describe("editLayout", () => {
  it("inserts the import and component after <body>", () => {
    const edited = editLayout(LAYOUT);
    expect(edited).toContain(
      'import { SodiumAgent } from "../sodium/SodiumAgent"',
    );
    expect(edited).toContain("<SodiumAgent />");
    expect(edited!.indexOf("<SodiumAgent />")).toBeGreaterThan(
      edited!.indexOf("<body"),
    );
  });

  it("is idempotent", () => {
    const once = editLayout(LAYOUT)!;
    expect(editLayout(once)).toBe(once);
  });

  it("returns null for unrecognized layouts", () => {
    expect(editLayout("export default () => null;")).toBeNull();
  });
});

describe("generateIntegration", () => {
  it("produces the full reviewable file set", () => {
    const output = generateIntegration({
      siteId: "site_fixtureshop01",
      loaderOrigin: "http://localhost:3000",
      contracts: [cancelOrder],
      layoutPath: "app/layout.tsx",
      layoutSource: LAYOUT,
    });
    const paths = output.files.map((file) => file.path).sort();
    expect(paths).toEqual([
      "app/layout.tsx",
      "sodium/README.md",
      "sodium/SodiumAgent.tsx",
      "sodium/bridge.ts",
      "sodium/manifest-meta.json",
      "sodium/verify.mjs",
    ]);
    expect(output.branch).toBe("sodium/integration-fixtureshop01");
    expect(output.layoutNeedsManualEdit).toBe(false);
    expect(output.body).toContain("state-affecting");
    const agent = output.files.find(
      (file) => file.path === "sodium/SodiumAgent.tsx",
    )!;
    expect(agent.content).toContain("script.dataset.site = SITE_ID");
    expect(agent.content).toContain("site_fixtureshop01");
  });

  it("falls back to manual instructions for unrecognized layouts", () => {
    const output = generateIntegration({
      siteId: "site_fixtureshop01",
      loaderOrigin: "http://localhost:3000",
      contracts: [cancelOrder],
      layoutPath: "app/layout.tsx",
      layoutSource: "export default () => null;",
    });
    expect(output.layoutNeedsManualEdit).toBe(true);
    expect(output.body).toContain("Manual step required");
    expect(output.files.some((file) => file.path === "app/layout.tsx")).toBe(
      false,
    );
  });
});
