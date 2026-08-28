import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Serves the versioned, immutable loader bundle. One shared, open-source
 * loader for every customer — the snippet carries only the loader URL and a
 * site id, never customer-specific executable code.
 *
 * Resolved via filesystem candidates (not require.resolve: Turbopack rewrites
 * module ids for transpiled workspace packages).
 */

const CANDIDATES = [
  process.env.SODIUM_LOADER_FILE,
  join(process.cwd(), "node_modules", "@sodium", "runtime", "dist", "agent.js"),
  join(process.cwd(), "..", "..", "packages", "runtime", "dist", "agent.js"),
].filter((candidate): candidate is string => Boolean(candidate));

let cached: string | null = null;

function loadBundle(): string | null {
  if (cached) return cached;
  for (const candidate of CANDIDATES) {
    try {
      cached = readFileSync(candidate, "utf8");
      return cached;
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function GET() {
  const bundle = loadBundle();
  if (!bundle) {
    return new Response(
      "// loader bundle not built — run: pnpm --filter @sodium/runtime build\n",
      {
        status: 503,
        headers: { "content-type": "application/javascript; charset=utf-8" },
      },
    );
  }
  return new Response(bundle, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    },
  });
}
