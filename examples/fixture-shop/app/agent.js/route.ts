import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Serves the shared, immutable loader bundle for the self-contained fixture. */

const CANDIDATES = [
  process.env.SODIUM_LOADER_FILE,
  join(process.cwd(), "node_modules", "@sodium", "runtime", "dist", "agent.js"),
  join(process.cwd(), "..", "..", "packages", "runtime", "dist", "agent.js"),
].filter((candidate): candidate is string => Boolean(candidate));

export async function GET() {
  for (const candidate of CANDIDATES) {
    try {
      const bundle = readFileSync(candidate, "utf8");
      return new Response(bundle, {
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    } catch {
      // try next candidate
    }
  }
  return new Response(
    "// loader bundle not built — run: pnpm --filter @sodium/runtime build\n",
    {
      status: 503,
      headers: { "content-type": "application/javascript; charset=utf-8" },
    },
  );
}
