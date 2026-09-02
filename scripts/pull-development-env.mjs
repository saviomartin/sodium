import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "sodium-env-"));
const pulledPath = join(temporaryDirectory, "development.env");

function runVercel(args) {
  let result = spawnSync("vercel", args, { cwd: root, stdio: "inherit" });
  if (result.error?.code === "ENOENT") {
    result = spawnSync("pnpm", ["dlx", "vercel@59.11.2", ...args], {
      cwd: root,
      stdio: "inherit",
    });
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function writeEnvironment(relativePath, keys, source) {
  const target = join(root, relativePath);
  const temporary = `${target}.tmp`;
  const contents = `${keys.map((key) => `${key}=${JSON.stringify(source[key])}`).join("\n")}\n`;
  writeFileSync(temporary, contents, { mode: 0o600 });
  renameSync(temporary, target);
  chmodSync(target, 0o600);
}

try {
  runVercel(["env", "pull", pulledPath, "--environment=development", "--yes"]);
  const environment = parse(readFileSync(pulledPath, "utf8"));
  const required = [
    "SODIUM_ENVIRONMENT",
    "NEXT_PUBLIC_SODIUM_ENVIRONMENT",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_DB_URL",
    "SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID",
    "SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET",
    "SITE_URL",
  ];
  const missing = required.filter((key) => !environment[key]);
  if (missing.length > 0) {
    throw new Error(`Vercel Development is missing: ${missing.join(", ")}`);
  }
  if (
    environment.SODIUM_ENVIRONMENT !== "development" ||
    environment.NEXT_PUBLIC_SODIUM_ENVIRONMENT !== "development" ||
    environment.NEXT_PUBLIC_SUPABASE_URL !==
      "https://laqlbydlawieccohknsj.supabase.co" ||
    environment.SITE_URL !== "http://localhost:3000"
  ) {
    throw new Error("Vercel Development is not isolated to sodium-development");
  }
  writeEnvironment(
    ".env",
    [
      "SODIUM_ENVIRONMENT",
      "SUPABASE_DB_URL",
      "SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID",
      "SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET",
    ],
    environment,
  );
  writeEnvironment(
    "apps/web/.env.local",
    [
      "NEXT_PUBLIC_SODIUM_ENVIRONMENT",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
      "SITE_URL",
    ],
    environment,
  );
  console.log("Development environment synced for the dashboard.");
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
