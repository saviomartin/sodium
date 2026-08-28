/**
 * Applies pending supabase/migrations to the hosted project over the IPv4
 * session pooler (`SUPABASE_DB_URL` from ./.env). No Docker required.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(root, ".env"))) {
  for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set (see .env.example)");
  process.exit(1);
}
const result = spawnSync("supabase", ["db", "push", "--yes", "--db-url", url], {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
