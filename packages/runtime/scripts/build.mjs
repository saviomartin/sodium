/**
 * Builds the immutable browser loader: dist/agent.js (IIFE, minified).
 * Verification keys are pinned into the bundle:
 *   SODIUM_MANIFEST_JWKS='{"key-1":{...jwk}}'  — production keys
 *   (falls back to the committed INSECURE dev key for local development)
 */
import { build } from "esbuild";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const jwks = process.env.SODIUM_MANIFEST_JWKS
  ? JSON.parse(process.env.SODIUM_MANIFEST_JWKS)
  : JSON.parse(readFileSync(join(root, "keys", "dev-jwks.json"), "utf8"));

const keyIds = Object.keys(jwks);
if (keyIds.length === 0) throw new Error("no manifest verification keys provided");

await build({
  entryPoints: [join(root, "src", "entry.ts")],
  outfile: join(root, "dist", "agent.js"),
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2022"],
  legalComments: "none",
  define: {
    __SODIUM_KEYS__: JSON.stringify(jwks),
  },
  banner: {
    js: `/*! sodium agent loader v${pkg.version} | keys: ${keyIds.join(",")} | open source: packages/runtime */`,
  },
});

const size = statSync(join(root, "dist", "agent.js")).size;
const MAX_BYTES = 30 * 1024;
console.log(`dist/agent.js: ${(size / 1024).toFixed(1)} KiB`);
if (size > MAX_BYTES) {
  throw new Error(`loader bundle ${size} bytes exceeds budget of ${MAX_BYTES}`);
}
