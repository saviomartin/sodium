import { z } from "zod";
import { AnalysisStageSchema, JobErrorSchema, RunStatusSchema } from "./jobs";

/**
 * Realtime progress events broadcast by the worker on the private channel
 * `run:{runId}`. The dashboard subscribes instead of polling.
 */
export const RunProgressEventSchema = z
  .object({
    runId: z.string().uuid(),
    stage: AnalysisStageSchema,
    status: RunStatusSchema,
    /** 0..100 coarse progress within the stage. */
    percent: z.number().min(0).max(100).optional(),
    message: z.string().max(500).optional(),
    error: JobErrorSchema.optional(),
    at: z.string().datetime(),
  })
  .strict();
export type RunProgressEvent = z.infer<typeof RunProgressEventSchema>;

export const RUN_CHANNEL_PREFIX = "run:";
export const RUN_PROGRESS_EVENT = "progress";

export function runChannel(runId: string): string {
  return `${RUN_CHANNEL_PREFIX}${runId}`;
}
