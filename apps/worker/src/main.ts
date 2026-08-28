import { loadEnv } from "./env";
import { createWorkerContext } from "./db";
import { startConsumer, type JobOutcome } from "./queue";
import { handleAnalysisStage } from "./pipeline/stages";
import { handleSyncCompare } from "./pipeline/sync";
import { handleGeneratePr } from "./pipeline/generate-pr";
import { log, setLogLevel } from "./log";
import type { JobMessage } from "@sodium/contracts";

const env = loadEnv();
setLogLevel(env.LOG_LEVEL);
const ctx = createWorkerContext(env);

async function dispatch(message: JobMessage): Promise<JobOutcome> {
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
    case "publication.generate_pr":
      return handleGeneratePr(ctx, message.publicationId);
  }
}

const consumer = startConsumer(ctx.sql, env.WORKER_CONCURRENCY, dispatch);
log("info", "sodium worker started", {
  concurrency: env.WORKER_CONCURRENCY,
  github: Boolean(env.GITHUB_APP_ID),
  ai: Boolean(env.AI_GATEWAY_API_KEY),
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", "shutting down", { signal });
  await consumer.stop();
  await ctx.sql.end({ timeout: 5 });
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
