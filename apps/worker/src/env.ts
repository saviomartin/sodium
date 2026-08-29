import { z } from "zod";

export const DEFAULT_AI_MODEL = "openai/gpt-5.6-terra";
export const DEFAULT_AI_FALLBACK_MODEL = "anthropic/claude-sonnet-5";
const GatewayModelIdSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/,
    "must use the AI Gateway provider/model format",
  );

/**
 * Worker environment. Validated at startup — the process refuses to boot on
 * invalid configuration rather than failing mid-job.
 *
 * GitHub App credentials are required because local development uses the same
 * repository path as production. AI remains optional; deterministic synthesis
 * keeps analysis useful when no model credential is configured.
 */
const EnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  /** Secret (service) API key — server-only, never shipped to browsers. */
  SUPABASE_SECRET_KEY: z.string().min(20),
  /** Direct Postgres connection for pgmq + realtime.send. */
  SUPABASE_DB_URL: z.string().url(),
  /** Scratch space for cloned repository snapshots. */
  WORK_DIR: z.string().default("/tmp/sodium-worker"),
  /** Canonical public loader origin written into generated integrations. */
  SODIUM_PUBLIC_URL: z
    .string()
    .url()
    .default("https://sodium-webmcp.vercel.app"),

  GITHUB_APP_ID: z.string().min(1),
  GITHUB_APP_PRIVATE_KEY: z.string().min(100),

  // AI synthesis (optional in local development)
  AI_GATEWAY_API_KEY: z.string().optional(),
  /** Automatically supplied by Vercel deployments and `vercel env pull`. */
  VERCEL_OIDC_TOKEN: z.string().optional(),
  AI_MODEL: GatewayModelIdSchema.default(DEFAULT_AI_MODEL),
  AI_FALLBACK_MODEL: GatewayModelIdSchema.default(DEFAULT_AI_FALLBACK_MODEL),

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
