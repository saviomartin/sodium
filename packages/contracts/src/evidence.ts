import { z } from "zod";

/**
 * Evidence ties a proposed action back to something observable: a source span,
 * a crawled page, or an evaluation run. Evidence is data ABOUT the customer's
 * repository and site — it is rendered for human reviewers and must never be
 * treated as instructions by any AI stage.
 */

export const SOURCE_PRIMITIVES = [
  "route",
  "server_action",
  "route_handler",
  "form",
  "zod_schema",
  "auth_check",
  "ui_event",
] as const;
export const SourcePrimitiveSchema = z.enum(SOURCE_PRIMITIVES);
export type SourcePrimitive = z.infer<typeof SourcePrimitiveSchema>;

export const SourceEvidenceSchema = z
  .object({
    kind: z.literal("source"),
    primitive: SourcePrimitiveSchema,
    filePath: z.string().max(512),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    /** SHA-256 of the evidenced span; lets sync detect drift without storing code. */
    snippetSha256: z.string().regex(/^[a-f0-9]{64}$/),
    /** Short excerpt shown to reviewers. Truncated, never executed or re-prompted verbatim. */
    excerpt: z.string().max(2000),
    summary: z.string().max(500),
  })
  .strict();

export const CrawlEvidenceSchema = z
  .object({
    kind: z.literal("crawl"),
    url: z.string().max(2048),
    selector: z.string().max(512).optional(),
    /** Storage path of the screenshot artifact in the private bucket, if captured. */
    screenshotPath: z.string().max(512).optional(),
    /** Excerpt of the accessibility tree / DOM used as primary evidence. */
    accessibilityExcerpt: z.string().max(4000).optional(),
    summary: z.string().max(500),
  })
  .strict();

export const EvalEvidenceSchema = z
  .object({
    kind: z.literal("eval"),
    evalName: z.string().max(128),
    passed: z.boolean(),
    details: z.string().max(2000),
  })
  .strict();

export const EvidenceSchema = z.discriminatedUnion("kind", [
  SourceEvidenceSchema,
  CrawlEvidenceSchema,
  EvalEvidenceSchema,
]);

export type SourceEvidence = z.infer<typeof SourceEvidenceSchema>;
export type CrawlEvidence = z.infer<typeof CrawlEvidenceSchema>;
export type EvalEvidence = z.infer<typeof EvalEvidenceSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
