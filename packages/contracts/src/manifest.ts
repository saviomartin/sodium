import { z } from "zod";
import { SiteIdSchema, ToolNameSchema } from "./ids";
import { ConfirmationPolicySchema, RiskLevelSchema } from "./risk";
import { HandlerBindingSchema, RouteConditionSchema } from "./action-contract";
import { ToolInputSchemaSchema } from "./json-schema";

/**
 * The published manifest is the ONLY thing the browser loader consumes.
 * It contains declarative data exclusively — schemas, selectors, templates,
 * bounded recipes — never executable code. The loader rejects anything that does
 * not parse against this shape.
 */

export const MANIFEST_VERSION = 2;

/** Aligned with MCP/WebMCP tool annotations; the runtime adapter maps them. */
export const ToolAnnotationsSchema = z
  .object({
    readOnlyHint: z.boolean(),
    destructiveHint: z.boolean(),
    idempotentHint: z.boolean(),
    openWorldHint: z.boolean(),
  })
  .strict();
export type ToolAnnotations = z.infer<typeof ToolAnnotationsSchema>;

export const PublishedToolSchema = z
  .object({
    name: ToolNameSchema,
    title: z.string().min(3).max(120),
    description: z.string().min(10).max(1024),
    inputSchema: ToolInputSchemaSchema,
    annotations: ToolAnnotationsSchema,
    riskLevel: RiskLevelSchema,
    confirmation: ConfirmationPolicySchema,
    routes: z.array(RouteConditionSchema).min(1).max(16),
    handler: HandlerBindingSchema,
  })
  .strict();
export type PublishedTool = z.infer<typeof PublishedToolSchema>;

export const ToolManifestSchema = z
  .object({
    manifestVersion: z.literal(MANIFEST_VERSION),
    siteId: SiteIdSchema,
    /** Origins the loader will accept this manifest on. Exact-match, scheme included. */
    origins: z.array(z.string().url()).min(1).max(8),
    /** Monotonic per-site version; rollback publishes a new version with old content. */
    version: z.number().int().positive(),
    generatedAt: z.string().datetime(),
    tools: z.array(PublishedToolSchema).max(128),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const seen = new Set<string>();
    for (const tool of manifest.tools) {
      if (seen.has(tool.name)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate tool name "${tool.name}"`,
        });
      }
      seen.add(tool.name);
    }
  });
export type ToolManifest = z.infer<typeof ToolManifestSchema>;

/**
 * Signed envelope served by the manifest endpoint. `payload` is the
 * base64url-encoded canonical JSON of the manifest; the signature covers the
 * payload bytes exactly as encoded.
 */
export const SignedManifestSchema = z
  .object({
    algorithm: z.literal("Ed25519"),
    keyId: z.string().min(1).max(64),
    payload: z.string().min(1),
    signature: z.string().min(1),
  })
  .strict();
export type SignedManifest = z.infer<typeof SignedManifestSchema>;

/**
 * Deterministic JSON serialization (lexicographically sorted keys) so signing
 * and verification agree byte-for-byte across Node and the browser.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([k, v]) => [k, sortKeys(v)]));
  }
  return value;
}

/** Derives runtime annotations from a contract's risk level. Deterministic. */
export function annotationsForRisk(
  riskLevel: PublishedTool["riskLevel"],
): ToolAnnotations {
  return {
    readOnlyHint: riskLevel === "read_only",
    destructiveHint: riskLevel === "destructive" || riskLevel === "financial",
    // Reversible actions are safe to retry; anything stronger must not be
    // assumed idempotent without the customer's backend guaranteeing it.
    idempotentHint: riskLevel === "read_only" || riskLevel === "reversible",
    openWorldHint: false,
  };
}
