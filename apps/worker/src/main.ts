import { loadEnv } from "./env";
import { createWorkerContext } from "./db";
import { startConsumer } from "./queue";
import { createDispatcher } from "./runner";
import { log, setLogLevel } from "./log";

const env = loadEnv();
setLogLevel(env.LOG_LEVEL);
const ctx = createWorkerContext(env);
const consumer = startConsumer(
  ctx.sql,
  env.WORKER_CONCURRENCY,
  createDispatcher(ctx),
);
log("info", "sodium worker started", {
  concurrency: env.WORKER_CONCURRENCY,
  github: Boolean(env.GITHUB_APP_ID),
  ai: "gateway_with_deterministic_fallback",
  aiModel: env.AI_MODEL,
  aiFallbackModel: env.AI_FALLBACK_MODEL,
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
