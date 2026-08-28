/**
 * Applies supabase/seed.sql to the linked hosted project.
 * Usage: node scripts/db-seed.mjs   (reads SUPABASE_DB_URL from ./.env or env)
 * Idempotence: seed data uses fixed UUIDs; re-running against an already
 * seeded database fails on conflicts by design — reset first if needed.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}
loadDotEnv(join(root, ".env"));

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set (see .env.example)");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await sql.file(join(root, "supabase", "seed.sql"));
  console.log("seed applied");
} finally {
  await sql.end();
}
