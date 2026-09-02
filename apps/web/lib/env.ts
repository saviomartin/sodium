import "server-only";
import { createPrivateKey } from "node:crypto";
import { z } from "zod";
import { publicEnv } from "./public-env";

/**
 * Server environment for the dashboard. Validated once at import; the app
 * refuses to boot misconfigured. Secrets here never reach client bundles —
 * only NEXT_PUBLIC_* values do, and those are non-secret by definition.
 */
const EnvSchema = z
  .object({
    SUPABASE_SECRET_KEY: z.string().min(20),
    SITE_URL: z.string().url().optional(),
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
    VERCEL_URL: z.string().optional(),
    MANIFEST_SIGNING_KEY_ID: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9._-]+$/)
      .optional(),
    MANIFEST_SIGNING_PRIVATE_KEY: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (
      Boolean(value.MANIFEST_SIGNING_KEY_ID) !==
      Boolean(value.MANIFEST_SIGNING_PRIVATE_KEY)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "MANIFEST_SIGNING_KEY_ID and MANIFEST_SIGNING_PRIVATE_KEY must be configured together",
        path: ["MANIFEST_SIGNING_KEY_ID"],
      });
    }
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

export interface DeploymentSigningKey {
  keyId: string;
  privateKeyPem: string;
}

let cachedSigningKey: DeploymentSigningKey | null = null;

/** Server-only Ed25519 key used to authorize immutable deployments. */
export function deploymentSigningKey(): DeploymentSigningKey {
  if (cachedSigningKey) return cachedSigningKey;
  const keyId = env.MANIFEST_SIGNING_KEY_ID;
  const privateKey = env.MANIFEST_SIGNING_PRIVATE_KEY;
  if (!keyId || !privateKey) {
    throw new Error("deployment signing key is not configured");
  }
  if (
    publicEnv.NEXT_PUBLIC_SODIUM_ENVIRONMENT === "production" &&
    keyId.startsWith("dev-insecure")
  ) {
    throw new Error("refusing to sign production deployments with a dev key");
  }
  const parsedKey = createPrivateKey(privateKey.replace(/\\n/g, "\n"));
  if (parsedKey.asymmetricKeyType !== "ed25519") {
    throw new Error("deployment signing key must be an Ed25519 private key");
  }
  cachedSigningKey = {
    keyId,
    privateKeyPem: parsedKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
  };
  return cachedSigningKey;
}
