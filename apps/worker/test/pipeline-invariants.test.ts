import { describe, expect, it } from "vitest";
import type { StaticAnalysis } from "@sodium/analyzer";
import {
  assertCandidateCoverage,
  countPotentialCapabilities,
} from "../src/pipeline/stages";

const emptyAnalysis: StaticAnalysis = {
  framework: "nextjs",
  projectRoot: "",
  appDir: "app",
  routes: [
    {
      urlPattern: "/",
      pathPattern: "/",
      kind: "page",
      params: [],
      span: { filePath: "app/page.tsx", startLine: 1, endLine: 20 },
    },
  ],
  forms: [],
  links: [],
  serverActions: [],
  routeHandlers: [],
  zodSchemas: [],
  authSignals: [],
  warnings: [],
  stats: { filesScanned: 1, filesSkipped: 0, bytesRead: 100 },
};

describe("analysis completion invariants", () => {
  it("allows an honest empty result only when no capability exists", () => {
    expect(countPotentialCapabilities(emptyAnalysis)).toBe(0);
    expect(() => assertCandidateCoverage(0, 0, 0)).not.toThrow();
  });

  it("refuses to mark analysis successful when grounded capabilities vanished", () => {
    const analysis: StaticAnalysis = {
      ...emptyAnalysis,
      links: [
        {
          href: "/practice",
          label: "Practice",
          routeBindings: [{ urlPattern: "/", pathPattern: "/" }],
          span: { filePath: "app/page.tsx", startLine: 5, endLine: 5 },
          excerpt: '<Link href="/practice">Practice</Link>',
        },
      ],
    };
    expect(countPotentialCapabilities(analysis)).toBe(1);
    expect(() => assertCandidateCoverage(1, 0, 0)).toThrow(
      "no candidates despite 1 source-grounded capabilities",
    );
  });

  it("surfaces malformed proposals instead of silently dropping all of them", () => {
    expect(() =>
      assertCandidateCoverage(2, 2, 0, ["invalid tool name"]),
    ).toThrow("All 2 generated tool proposals were invalid: invalid tool name");
  });

  it("does not claim unsupported server-action inputs are executable", () => {
    const analysis: StaticAnalysis = {
      ...emptyAnalysis,
      serverActions: [
        {
          name: "checkout",
          params: ["input"],
          parameters: [{ name: "input", typeText: "CheckoutPayload" }],
          takesFormData: false,
          authSignals: [],
          span: { filePath: "app/actions.ts", startLine: 1, endLine: 5 },
          excerpt: "export async function checkout(input: CheckoutPayload) {}",
        },
      ],
    };

    expect(countPotentialCapabilities(analysis)).toBe(0);
  });
});
