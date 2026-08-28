import { z } from "zod";

/**
 * Worker environment. Validated at startup — the process refuses to boot on
 * invalid configuration rather than failing mid-job.
 *
 * Credentials policy: GitHub App and AI credentials are OPTIONAL; without
 * them the worker runs the fixture-backed local providers (real adapters stay
 * implemented, no invented credentials). Supabase credentials are required.
 */
const EnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  /** Secret (service) API key — server-only, never shipped to browsers. */
  SUPABASE_SECRET_KEY: z.string().min(20),
  /** Direct Postgres connection for pgmq + realtime.send. */
  SUPABASE_DB_URL: z.string().url(),
  /** Scratch space for cloned repository snapshots. */
  WORK_DIR: z.string().default("/tmp/sodium-worker"),

  // GitHub App (optional in local development)
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),

  // AI synthesis (optional in local development)
  AI_GATEWAY_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("anthropic/claude-sonnet-4-5"),

  /** Path to the fixture repo used when a repository has installation_id=0. */
  FIXTURE_REPO_DIR: z.string().optional(),

  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type WorkerEnv = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`invalid worker environment:\n${details}`);
  }
  return parsed.data;
}

export function hasGithubCredentials(env: WorkerEnv): boolean {
  return Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY);
}

export function hasAiCredentials(env: WorkerEnv): boolean {
  return Boolean(env.AI_GATEWAY_API_KEY);
}
