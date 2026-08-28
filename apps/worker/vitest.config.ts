import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

// Load .env so database-backed tests can reach the hosted project; unit tests
// don't depend on it (db tests are skipped when SUPABASE_DB_URL is absent).
for (const envPath of [
  join(__dirname, ".env"),
  join(__dirname, "..", "..", ".env"),
]) {
  if (!existsSync(envPath)) continue;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !(match[1]! in process.env))
      process.env[match[1]!] = match[2]!;
  }
}

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
