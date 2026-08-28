import { z } from "zod";

/**
 * Queue message contracts. Every message is one resumable pipeline stage;
 * completing a stage enqueues the next one, so a crashed worker resumes at
 * the stage boundary. Stages are idempotent: re-running one overwrites its
 * own outputs keyed by (runId, stage).
 */

export const ANALYSIS_STAGES = [
  "clone",
  "static",
  "crawl",
  "synthesize",
  "validate",
] as const;
export const AnalysisStageSchema = z.enum(ANALYSIS_STAGES);
export type AnalysisStage = z.infer<typeof AnalysisStageSchema>;

export const RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
] as const;
export const RunStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const AnalysisJobSchema = z
  .object({
    type: z.literal("analysis.stage"),
    runId: z.string().uuid(),
    stage: AnalysisStageSchema,
    /** Increments on retries of the same stage; bounded by the worker. */
    attempt: z.number().int().nonnegative().default(0),
  })
  .strict();

export const GeneratePrJobSchema = z
  .object({
    type: z.literal("publication.generate_pr"),
    publicationId: z.string().uuid(),
    attempt: z.number().int().nonnegative().default(0),
  })
  .strict();

export const SyncCompareJobSchema = z
  .object({
    type: z.literal("sync.compare"),
    repositoryId: z.string().uuid(),
    commitSha: z.string().regex(/^[a-f0-9]{40}$/),
    /** GitHub delivery GUID — used for idempotency. */
    deliveryId: z.string().max(128),
    attempt: z.number().int().nonnegative().default(0),
  })
  .strict();

export const JobMessageSchema = z.discriminatedUnion("type", [
  AnalysisJobSchema,
  GeneratePrJobSchema,
  SyncCompareJobSchema,
]);
export type JobMessage = z.infer<typeof JobMessageSchema>;

export const JOB_QUEUE = "sodium_jobs" as const;
export const MAX_JOB_ATTEMPTS = 3;

/** Structured, user-presentable job error. Never embeds repository content. */
export const JobErrorSchema = z
  .object({
    code: z.enum([
      "clone_failed",
      "repo_too_large",
      "parse_failed",
      "preview_unreachable",
      "preview_auth_failed",
      "ai_generation_failed",
      "ai_output_invalid",
      "validation_failed",
      "github_api_error",
      "internal",
    ]),
    message: z.string().max(2000),
    retryable: z.boolean(),
    stage: AnalysisStageSchema.optional(),
    detail: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
  })
  .strict();
export type JobError = z.infer<typeof JobErrorSchema>;
