import { z } from "zod";
import {
  assertGithubAppEnvironment,
  assertSupabaseEnvironment,
  SODIUM_ENVIRONMENTS,
} from "@sodium/contracts";

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
  SODIUM_ENVIRONMENT: z.enum(SODIUM_ENVIRONMENTS),
  SUPABASE_URL: z.string().url(),
  /** Secret (service) API key — server-only, never shipped to browsers. */
  SUPABASE_SECRET_KEY: z.string().min(20),
  /** Direct Postgres connection for pgmq + realtime.send. */
  SUPABASE_DB_URL: z.string().url(),
  /** Scratch space for cloned repository snapshots. */
  WORK_DIR: z.string().default("/tmp/sodium-worker"),
  /** Canonical public loader origin written into generated integrations. */
  SODIUM_PUBLIC_URL: z.string().url().optional(),
  VERCEL_ENV: z.enum(SODIUM_ENVIRONMENTS).optional(),
  VERCEL_URL: z.string().optional(),

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

export type WorkerEnv = Omit<z.infer<typeof EnvSchema>, "SODIUM_PUBLIC_URL"> & {
  SODIUM_PUBLIC_URL: string;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`invalid worker environment:\n${details}`);
  }
  assertSupabaseEnvironment(
    parsed.data.SODIUM_ENVIRONMENT,
    parsed.data.SUPABASE_URL,
  );
  assertGithubAppEnvironment(
    parsed.data.SODIUM_ENVIRONMENT,
    parsed.data.GITHUB_APP_ID,
  );
  if (
    parsed.data.VERCEL_ENV &&
    parsed.data.VERCEL_ENV !== parsed.data.SODIUM_ENVIRONMENT
  ) {
    throw new Error(
      `Vercel environment mismatch: VERCEL_ENV=${parsed.data.VERCEL_ENV}, SODIUM_ENVIRONMENT=${parsed.data.SODIUM_ENVIRONMENT}`,
    );
  }
  if (parsed.data.SODIUM_ENVIRONMENT === "preview") {
    if (!parsed.data.VERCEL_URL) {
      throw new Error("VERCEL_URL is required in the preview environment");
    }
    return {
      ...parsed.data,
      SODIUM_PUBLIC_URL: `https://${parsed.data.VERCEL_URL}`,
    };
  }
  if (!parsed.data.SODIUM_PUBLIC_URL) {
    throw new Error(
      "SODIUM_PUBLIC_URL is required outside the preview environment",
    );
  }
  return {
    ...parsed.data,
    SODIUM_PUBLIC_URL: parsed.data.SODIUM_PUBLIC_URL,
  };
}
