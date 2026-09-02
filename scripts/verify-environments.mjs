import { spawnSync } from "node:child_process";

const requiredByTarget = {
  development: [
    "NEXT_PUBLIC_SODIUM_ENVIRONMENT",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SITE_URL",
    "SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID",
    "SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET",
  ],
  preview: [
    "NEXT_PUBLIC_SODIUM_ENVIRONMENT",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID",
    "SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET",
  ],
  production: [
    "NEXT_PUBLIC_SODIUM_ENVIRONMENT",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SITE_URL",
    "SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID",
    "SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET",
  ],
};

const forbiddenLegacy = [
  "AI_GATEWAY_API_KEY",
  "CRON_SECRET",
  "GITHUB_WEBHOOK_SECRET",
  "MANIFEST_SIGNING_PRIVATE_KEY",
  "SODIUM_MANIFEST_JWKS",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "WORK_DIR",
];

const result = spawnSync("pnpm", ["exec", "vercel", "env", "ls", "--json"], {
  encoding: "utf8",
});
if (result.status !== 0) {
  throw new Error(result.stderr || result.stdout || "vercel env ls failed");
}
const rows = JSON.parse(result.stdout).envs ?? [];
const targetsFor = (key) =>
  new Set(
    rows.filter((row) => row.key === key).flatMap((row) => row.target ?? []),
  );

for (const [target, keys] of Object.entries(requiredByTarget)) {
  const missing = keys.filter((key) => !targetsFor(key).has(target));
  if (missing.length > 0) {
    throw new Error(`Vercel ${target} is missing: ${missing.join(", ")}`);
  }
}
const legacy = forbiddenLegacy.filter((key) => targetsFor(key).size > 0);
if (legacy.length > 0) {
  throw new Error(`remove legacy Vercel variables: ${legacy.join(", ")}`);
}
console.log("Environment verification passed for all Vercel targets.");
