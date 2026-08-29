import "server-only";
import { readFileSync } from "node:fs";
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

  /** Ed25519 manifest signing key: either inline PEM + id, or a JSON key file. */
  MANIFEST_SIGNING_KEY_ID: z.string().optional(),
  MANIFEST_SIGNING_PRIVATE_KEY: z.string().optional(),
  MANIFEST_SIGNING_KEY_FILE: z.string().optional(),

  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),

  // Optional at build time and required only by the billing entry points.
  STRIPE_SECRET_KEY: z
    .string()
    .regex(/^(sk|rk)_(test|live)_/)
    .optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  STRIPE_REPOSITORY_PRICE_ID: z.string().startsWith("price_").optional(),
  STRIPE_PORTAL_CONFIGURATION_ID: z.string().startsWith("bpc_").optional(),
  STRIPE_MODE: z.enum(["test", "live"]).optional(),
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

/** Canonical origin for callbacks and generated loader URLs. */
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

export interface SigningKey {
  keyId: string;
  privateKeyPem: string;
}

let cachedKey: SigningKey | null = null;

export function manifestSigningKey(): SigningKey {
  if (cachedKey) return cachedKey;
  if (env.MANIFEST_SIGNING_KEY_ID && env.MANIFEST_SIGNING_PRIVATE_KEY) {
    cachedKey = {
      keyId: env.MANIFEST_SIGNING_KEY_ID,
      privateKeyPem: env.MANIFEST_SIGNING_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  } else if (env.MANIFEST_SIGNING_KEY_FILE) {
    const file = JSON.parse(
      readFileSync(env.MANIFEST_SIGNING_KEY_FILE, "utf8"),
    ) as {
      keyId: string;
      privateKeyPem: string;
    };
    cachedKey = { keyId: file.keyId, privateKeyPem: file.privateKeyPem };
  } else {
    throw new Error(
      "manifest signing key not configured (MANIFEST_SIGNING_* env)",
    );
  }
  if (
    publicEnv.NEXT_PUBLIC_SODIUM_ENVIRONMENT === "production" &&
    cachedKey.keyId.startsWith("dev-insecure")
  ) {
    throw new Error(
      "refusing to run in production with the committed dev signing key",
    );
  }
  return cachedKey;
}
