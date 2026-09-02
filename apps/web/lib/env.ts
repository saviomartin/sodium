import "server-only";
import { z } from "zod";
import { publicEnv } from "./public-env";

/**
 * Server environment for the dashboard. Validated once at import; the app
 * refuses to boot misconfigured. Secrets here never reach client bundles —
 * only NEXT_PUBLIC_* values do, and those are non-secret by definition.
 */
const EnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20),
  SITE_URL: z.string().url().optional(),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
  VERCEL_URL: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(
    `invalid web environment:\n${parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`).join("\n")}`,
  );
}
export const env = parsed.data;

if (
  env.VERCEL_ENV &&
  env.VERCEL_ENV !== publicEnv.NEXT_PUBLIC_SODIUM_ENVIRONMENT
) {
  throw new Error(
    `Vercel environment mismatch: VERCEL_ENV=${env.VERCEL_ENV}, NEXT_PUBLIC_SODIUM_ENVIRONMENT=${publicEnv.NEXT_PUBLIC_SODIUM_ENVIRONMENT}`,
  );
}

function exactOrigin(raw: string): string {
  const url = new URL(raw);
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`site URL must be an origin without a path: ${raw}`);
  }
  return url.origin;
}

/** Canonical origin for callbacks and CLI links. */
export function siteUrl(): string {
  if (publicEnv.NEXT_PUBLIC_SODIUM_ENVIRONMENT === "preview") {
    if (env.SITE_URL) {
      return exactOrigin(env.SITE_URL);
    }
    if (env.VERCEL_URL) {
      return exactOrigin(`https://${env.VERCEL_URL}`);
    }
    throw new Error(
      "SITE_URL or VERCEL_URL is required in the preview environment",
    );
  }

  const url = exactOrigin(env.SITE_URL ?? "http://localhost:3000");
  if (
    publicEnv.NEXT_PUBLIC_SODIUM_ENVIRONMENT === "production" &&
    !url.startsWith("https://")
  ) {
    throw new Error("production SITE_URL must use https");
  }
  return url;
}
