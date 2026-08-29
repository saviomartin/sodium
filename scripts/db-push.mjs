/**
 * Applies pending supabase/migrations to the hosted project over the IPv4
 * session pooler (`SUPABASE_DB_URL` from ./.env). No Docker required.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const path of [join(root, ".env"), join(root, "apps/worker/.env")]) {
  if (!existsSync(path)) continue;
  for (const [key, value] of Object.entries(parse(readFileSync(path)))) {
    if (!(key in process.env)) process.env[key] = value;
  }
}
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set (see .env.example)");
  process.exit(1);
}
const environment = process.env.SODIUM_ENVIRONMENT;
const expectedRefs = {
  development: "laqlbydlawieccohknsj",
  preview: "laqlbydlawieccohknsj",
  production: "wsacbkkbvkcuqgiagxms",
};
const actualRef = /(?:postgres\.)?([a-z]{20})(?:[.:])/.exec(url)?.[1];
if (
  typeof environment !== "string" ||
  !(environment in expectedRefs) ||
  actualRef !== expectedRefs[environment]
) {
  console.error(
    `Refusing database push: ${environment ?? "unset"} environment does not match database project ${actualRef ?? "unknown"}`,
  );
  process.exit(1);
}
const result = spawnSync("supabase", ["db", "push", "--yes", "--db-url", url], {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
