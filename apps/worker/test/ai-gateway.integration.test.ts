import { describe, expect, it } from "vitest";
import type { StaticAnalysis } from "@sodium/analyzer";
import { buildPrimitives } from "../src/pipeline/primitives";
import {
  DEFAULT_AI_FALLBACK_MODEL,
  DEFAULT_AI_MODEL,
  type WorkerEnv,
} from "../src/env";
import { AiSdkProvider } from "../src/providers/ai-provider";

const analysis: StaticAnalysis = {
  framework: "nextjs",
  projectRoot: "",
  appDir: "app",
  routes: [
    {
      urlPattern: "/products/[id]",
      pathPattern: "/products/*",
      kind: "page",
      params: ["id"],
      span: {
        filePath: "app/products/[id]/page.tsx",
        startLine: 1,
        endLine: 20,
      },
    },
  ],
  forms: [],
  links: [],
  serverActions: [],
  routeHandlers: [],
  zodSchemas: [],
  authSignals: [],
  warnings: [],
  stats: { filesScanned: 1, filesSkipped: 0, bytesRead: 200 },
};
const primitives = buildPrimitives(analysis);
const live = process.env.RUN_AI_GATEWAY_INTEGRATION === "1";
const baseEnv = {
  AI_MODEL: DEFAULT_AI_MODEL,
  AI_FALLBACK_MODEL: DEFAULT_AI_FALLBACK_MODEL,
} as WorkerEnv;

describe.skipIf(!live)("AI Gateway live model chain", () => {
  it("generates a grounded contract with GPT-5.6 Terra", async () => {
    const result = await new AiSdkProvider(baseEnv).proposeTools({
      analysis,
      primitives,
    });

    expect(result.mode).toBe("ai");
    expect(result.model).toBe(DEFAULT_AI_MODEL);
    expect(result.modelErrors).toEqual([]);
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]).toMatchObject({
      riskLevel: "read_only",
      confirmation: "none",
      handler: { kind: "navigate", urlTemplate: "/products/{id}" },
      inputSchema: {
        required: ["id"],
        properties: { id: { type: "string" } },
      },
    });
  }, 120_000);

  it("uses Claude Sonnet 5 after a real primary-model Gateway failure", async () => {
    const result = await new AiSdkProvider({
      ...baseEnv,
      AI_MODEL: "openai/sodium-intentionally-invalid-model",
    }).proposeTools({ analysis, primitives });

    expect(result.mode).toBe("ai");
    expect(result.model).toBe(DEFAULT_AI_FALLBACK_MODEL);
    expect(result.attemptedModels).toEqual([
      "openai/sodium-intentionally-invalid-model",
      DEFAULT_AI_FALLBACK_MODEL,
    ]);
    expect(result.modelErrors?.[0]).toContain(
      "openai/sodium-intentionally-invalid-model",
    );
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]?.handler).toEqual({
      kind: "navigate",
      urlTemplate: "/products/{id}",
    });
  }, 120_000);
});
