import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "sodium-env-"));
const pulledPath = join(temporaryDirectory, "development.env");

function run(command, args) {
  let result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error?.code === "ENOENT" && command === "vercel") {
    result = spawnSync("pnpm", ["dlx", "vercel@59.10.0", ...args], {
      cwd: root,
      stdio: "inherit",
    });
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function serialize(keys, source) {
  return (
    keys
      .filter((key) => source[key] !== undefined && source[key] !== "")
      .map((key) => `${key}=${JSON.stringify(source[key])}`)
      .join("\n") + "\n"
  );
}

function writeAtomic(relativePath, keys, source) {
  const target = join(root, relativePath);
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, serialize(keys, source), { mode: 0o600 });
  renameSync(temporary, target);
  chmodSync(target, 0o600);
}

try {
  run("vercel", [
    "env",
    "pull",
    pulledPath,
    "--environment=development",
    "--yes",
  ]);
  const environment = parse(readFileSync(pulledPath, "utf8"));

  if (
    environment.SODIUM_ENVIRONMENT !== "development" ||
    environment.NEXT_PUBLIC_SODIUM_ENVIRONMENT !== "development" ||
    environment.NEXT_PUBLIC_SUPABASE_URL !==
      "https://laqlbydlawieccohknsj.supabase.co" ||
    environment.SUPABASE_URL !== "https://laqlbydlawieccohknsj.supabase.co" ||
    environment.SITE_URL !== "http://localhost:3000" ||
    environment.SODIUM_PUBLIC_URL !== "http://localhost:3000"
  ) {
    throw new Error(
      "Vercel Development is not isolated to localhost and sodium-development",
    );
  }

  // A failed credential rotation must never leave an older production env in
  // place. Only generated, ignored files containing the pinned production ref
  // are removed, after the replacement Development scope has been verified.
  for (const relativePath of [
    ".env",
    "apps/web/.env.local",
    "apps/worker/.env",
  ]) {
    const path = join(root, relativePath);
    if (
      existsSync(path) &&
      readFileSync(path, "utf8").includes("wsacbkkbvkcuqgiagxms")
    ) {
      unlinkSync(path);
    }
  }

  const required = [
    "SODIUM_ENVIRONMENT",
    "NEXT_PUBLIC_SODIUM_ENVIRONMENT",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_DB_URL",
    "SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID",
    "SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET",
    "SITE_URL",
    "SODIUM_PUBLIC_URL",
    "GITHUB_APP_ID",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_WEBHOOK_SECRET",
    "NEXT_PUBLIC_GITHUB_APP_SLUG",
    "MANIFEST_SIGNING_KEY_ID",
    "MANIFEST_SIGNING_PRIVATE_KEY",
  ];
  const missing = required.filter((key) => !environment[key]);
  if (missing.length > 0) {
    throw new Error(`Vercel Development is missing: ${missing.join(", ")}`);
  }

  writeAtomic(
    ".env",
    [
      "SODIUM_ENVIRONMENT",
      "SUPABASE_DB_URL",
      "SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID",
      "SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET",
    ],
    environment,
  );
  writeAtomic(
    "apps/web/.env.local",
    [
      "NEXT_PUBLIC_SODIUM_ENVIRONMENT",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
      "SITE_URL",
      "MANIFEST_SIGNING_KEY_ID",
      "MANIFEST_SIGNING_PRIVATE_KEY",
      "GITHUB_APP_ID",
      "GITHUB_APP_PRIVATE_KEY",
      "GITHUB_WEBHOOK_SECRET",
      "CRON_SECRET",
      "NEXT_PUBLIC_GITHUB_APP_SLUG",
    ],
    environment,
  );
  writeAtomic(
    "apps/worker/.env",
    [
      "SODIUM_ENVIRONMENT",
      "SUPABASE_URL",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_DB_URL",
      "WORK_DIR",
      "SODIUM_PUBLIC_URL",
      "GITHUB_APP_ID",
      "GITHUB_APP_PRIVATE_KEY",
      "AI_GATEWAY_API_KEY",
      "VERCEL_OIDC_TOKEN",
      "AI_MODEL",
      "AI_FALLBACK_MODEL",
      "WORKER_CONCURRENCY",
      "LOG_LEVEL",
    ],
    environment,
  );

  console.log("Development environment synced from Vercel and split by app.");
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
