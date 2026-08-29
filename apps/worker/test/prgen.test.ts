import { describe, expect, it } from "vitest";
import {
  findInstallTarget,
  generateIntegration,
  installLoaderScript,
  loaderSnippet,
} from "../src/prgen/generator";
import type { ActionContract } from "@sodium/contracts";

const navigateTool: ActionContract = {
  contractVersion: 1,
  actionId: "act_0123456789abcdef",
  name: "open_product",
  title: "Open product",
  description: "Opens the page for a specific product in the current shop.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  output: { description: "Navigation acknowledgement." },
  evidence: [
    {
      kind: "source",
      primitive: "route",
      filePath: "app/products/[id]/page.tsx",
      startLine: 1,
      endLine: 10,
      snippetSha256: "a".repeat(64),
      excerpt: "export default function ProductPage() {}",
      summary: "dynamic product page",
    },
  ],
  routes: [{ pathPattern: "/**" }],
  auth: { required: false, roles: [] },
  riskLevel: "read_only",
  confirmation: "none",
  handler: { kind: "navigate", urlTemplate: "/products/{id}" },
  confidence: 0.8,
};

const bridgeTool: ActionContract = {
  ...navigateTool,
  actionId: "act_fedcba9876543210",
  name: "cancel_order",
  title: "Cancel order",
  description: "Cancels an existing order after explicit user confirmation.",
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
      startLine: 1,
      endLine: 5,
      snippetSha256: "b".repeat(64),
      excerpt:
        "export async function cancelOrder(input: { orderId: string }) { return db.cancel(input.orderId); }",
      summary: "cancelOrder server action",
    },
  ],
  riskLevel: "destructive",
  confirmation: "required",
  handler: { kind: "bridge", bridgeKey: "actions.cancel_order" },
  confidence: 0.8,
};

const LAYOUT = `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;

const SNIPPET =
  '<script src="https://sodium-webmcp.vercel.app/agent/v1.js" data-site="site_fixtureshop01"></script>';

describe("loaderSnippet", () => {
  it("matches the copyable dashboard snippet and trims a trailing slash", () => {
    expect(
      loaderSnippet("https://sodium-webmcp.vercel.app/", "site_fixtureshop01"),
    ).toBe(SNIPPET);
  });
});

describe("findInstallTarget", () => {
  it("selects the analyzed app inside a monorepo", () => {
    expect(
      findInstallTarget([
        "package.json",
        "apps/web/package.json",
        "apps/web/next.config.ts",
        "apps/web/src/app/page.tsx",
        "apps/web/src/app/layout.tsx",
      ]),
    ).toBe("apps/web/src/app/layout.tsx");
  });
});

describe("installLoaderScript", () => {
  it("adds only the loader tag to a Next.js root layout", () => {
    const edited = installLoaderScript(LAYOUT, SNIPPET);
    expect(edited).toContain(`<body>\n        ${SNIPPET}`);
    expect(edited).not.toContain("<head>");
    expect(edited).not.toContain("SodiumAgent");
    expect(edited).not.toContain("sodium/bridge");
  });

  it("inserts into an existing HTML head", () => {
    const edited = installLoaderScript(
      "<html>\n<head><title>Shop</title></head>\n<body></body>\n</html>",
      SNIPPET,
    );
    expect(edited).toContain(`  ${SNIPPET}\n</head>`);
  });

  it("is idempotent when the exact loader is already installed", () => {
    const once = installLoaderScript(LAYOUT, SNIPPET)!;
    expect(installLoaderScript(once, SNIPPET)).toBe(once);
  });

  it("repairs an old loader and removes duplicates", () => {
    const source = `<head>
<script src="https://old.example/agent/v1.js" data-site="site_old"></script>
<script data-site="site_old" src="https://old.example/agent/v1.js"></script>
</head>`;
    const edited = installLoaderScript(source, SNIPPET)!;
    expect(edited.match(/<script/g)).toHaveLength(1);
    expect(edited).toContain(SNIPPET);
    expect(edited).not.toContain("old.example");
  });

  it("does not replace unrelated scripts that also use data-site", () => {
    const unrelated =
      '<script src="https://analytics.example/client.js" data-site="shop"></script>';
    const edited = installLoaderScript(
      "<head>" + unrelated + "</head>",
      SNIPPET,
    )!;
    expect(edited).toContain(unrelated);
    expect(edited).toContain(SNIPPET);
  });

  it("refuses an unsafe file with no document insertion point", () => {
    expect(
      installLoaderScript("export default () => null;", SNIPPET),
    ).toBeNull();
  });
});

describe("generateIntegration", () => {
  it("changes exactly one existing file and adds no generated files", () => {
    const output = generateIntegration({
      siteId: "site_fixtureshop01",
      loaderOrigin: "https://sodium-webmcp.vercel.app",
      contracts: [navigateTool],
      targetPath: "app/layout.tsx",
      targetSource: LAYOUT,
    });
    expect(output.files).toEqual([
      {
        path: "app/layout.tsx",
        content: expect.stringContaining(SNIPPET),
      },
    ]);
    expect(output.title).toBe("Install Sodium WebMCP loader");
    expect(output.branch).toBe("sodium/install-fixtureshop01");
    expect(output.alreadyInstalled).toBe(false);
    expect(output.body).toContain("Does not add generated application code");
  });

  it("returns no files when installation is already complete", () => {
    const installed = installLoaderScript(LAYOUT, SNIPPET)!;
    const output = generateIntegration({
      siteId: "site_fixtureshop01",
      loaderOrigin: "https://sodium-webmcp.vercel.app",
      contracts: [navigateTool],
      targetPath: "app/layout.tsx",
      targetSource: installed,
    });
    expect(output.files).toEqual([]);
    expect(output.alreadyInstalled).toBe(true);
  });

  it("fails clearly instead of opening a partial PR", () => {
    expect(() =>
      generateIntegration({
        siteId: "site_fixtureshop01",
        loaderOrigin: "https://sodium-webmcp.vercel.app",
        contracts: [navigateTool],
        targetPath: "app/layout.tsx",
        targetSource: "export default () => null;",
      }),
    ).toThrow("Could not find a safe <head> or <body> insertion point");
  });

  it("generates reviewed server-action bindings instead of discarding bridge tools", () => {
    const output = generateIntegration({
      siteId: "site_fixtureshop01",
      loaderOrigin: "https://sodium-webmcp.vercel.app",
      contracts: [navigateTool, bridgeTool],
      targetPath: "app/layout.tsx",
      targetSource: LAYOUT,
    });
    const agent = output.files.find(
      (file) => file.path === "sodium/SodiumAgent.tsx",
    )?.content;
    const layout = output.files.find(
      (file) => file.path === "app/layout.tsx",
    )?.content;

    expect(agent).toContain(
      'import { cancelOrder as sodiumAction0 } from "../app/actions";',
    );
    expect(agent).toContain(
      '"actions.cancel_order": async (input) => sodiumAction0(input as never)',
    );
    expect(agent).toContain('script.dataset.sodiumLoader = "true"');
    expect(layout).toContain(
      'import { SodiumAgent } from "../sodium/SodiumAgent";',
    );
    expect(layout).toContain("<SodiumAgent />");
    expect(output.body).toContain("reviewed first-party server-action binding");
    expect(output.alreadyInstalled).toBe(false);
  });

  it("keeps generated bindings inside the selected monorepo app", () => {
    const monorepoBridge = {
      ...bridgeTool,
      evidence: bridgeTool.evidence.map((evidence) =>
        evidence.kind === "source"
          ? {
              ...evidence,
              filePath: "apps/web/src/app/actions.ts",
            }
          : evidence,
      ),
    };
    const output = generateIntegration({
      siteId: "site_fixtureshop01",
      loaderOrigin: "https://sodium-webmcp.vercel.app",
      contracts: [monorepoBridge],
      targetPath: "apps/web/src/app/layout.tsx",
      targetSource: LAYOUT,
    });
    const agent = output.files.find(
      (file) => file.path === "apps/web/src/sodium/SodiumAgent.tsx",
    )?.content;
    const layout = output.files.find(
      (file) => file.path === "apps/web/src/app/layout.tsx",
    )?.content;

    expect(agent).toContain(
      'import { cancelOrder as sodiumAction0 } from "../app/actions";',
    );
    expect(layout).toContain(
      'import { SodiumAgent } from "../sodium/SodiumAgent";',
    );
  });

  it("does not duplicate an existing single-quoted agent import", () => {
    const installed =
      "import { SodiumAgent } from '../sodium/SodiumAgent';\n" +
      LAYOUT.replace("<body>", "<body><SodiumAgent />");
    const output = generateIntegration({
      siteId: "site_fixtureshop01",
      loaderOrigin: "https://sodium-webmcp.vercel.app",
      contracts: [bridgeTool],
      targetPath: "app/layout.tsx",
      targetSource: installed,
    });

    expect(output.files.some((file) => file.path === "app/layout.tsx")).toBe(
      false,
    );
  });

  it("fails closed when a bridge contract has no recoverable source binding", () => {
    expect(() =>
      generateIntegration({
        siteId: "site_fixtureshop01",
        loaderOrigin: "https://sodium-webmcp.vercel.app",
        contracts: [{ ...bridgeTool, evidence: [] }],
        targetPath: "app/layout.tsx",
        targetSource: LAYOUT,
      }),
    ).toThrow("has no server-action source binding");
  });
});
