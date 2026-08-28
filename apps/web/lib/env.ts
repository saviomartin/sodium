import "server-only";
import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * Server environment for the dashboard. Validated once at import; the app
 * refuses to boot misconfigured. Secrets here never reach client bundles —
 * only NEXT_PUBLIC_* values do, and those are non-secret by definition.
 */
const EnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20),
  SITE_URL: z.string().url().default("http://localhost:3000"),

  /** Ed25519 manifest signing key: either inline PEM + id, or a JSON key file. */
  MANIFEST_SIGNING_KEY_ID: z.string().optional(),
  MANIFEST_SIGNING_PRIVATE_KEY: z.string().optional(),
  MANIFEST_SIGNING_KEY_FILE: z.string().optional(),

  // GitHub App. Optional at build time so configuration errors render in-app.
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  NEXT_PUBLIC_GITHUB_APP_SLUG: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(
    `invalid web environment:\n${parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`).join("\n")}`,
  );
}
export const env = parsed.data;

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
    process.env.NODE_ENV === "production" &&
    cachedKey.keyId.startsWith("dev-insecure")
  ) {
    throw new Error(
      "refusing to run in production with the committed dev signing key",
    );
  }
  return cachedKey;
}

export function hasGithubApp(): boolean {
  return Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY);
}
