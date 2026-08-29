import type { JobMessage } from "@sodium/contracts";
import type { WorkerContext } from "./db";
import { handleAnalysisStage } from "./pipeline/stages";
import { handleSyncCompare } from "./pipeline/sync";
import { processOne, readJobsNow, type JobOutcome } from "./queue";

export function createDispatcher(ctx: WorkerContext) {
  return async (message: JobMessage): Promise<JobOutcome> => {
    switch (message.type) {
      case "analysis.stage":
        return handleAnalysisStage(ctx, message.runId, message.stage);
      case "sync.compare":
        return handleSyncCompare(
          ctx,
          message.repositoryId,
          message.commitSha,
          message.deliveryId,
        );
    }
  };
}

/** Drain currently available jobs without polling. Used by Vercel Functions;
 * the durable pgmq queue remains the source of truth between invocations. */
export async function drainAvailableJobs(
  ctx: WorkerContext,
  options: { maxJobs?: number; deadlineMs?: number } = {},
): Promise<number> {
  const maxJobs = options.maxJobs ?? 25;
  const deadlineMs = options.deadlineMs ?? Date.now() + 270_000;
  const dispatch = createDispatcher(ctx);
  let processed = 0;

  while (processed < maxJobs && Date.now() < deadlineMs) {
    const rows = await readJobsNow(ctx.sql, 1);
    const row = rows[0];
    if (!row) break;
    await processOne(ctx.sql, row, dispatch);
    processed++;
  }

  return processed;
}
