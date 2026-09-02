import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await build({
  entryPoints: [join(root, "src", "index.ts")],
  outfile: join(root, "dist", "index.js"),
  bundle: true,
  minify: true,
  format: "esm",
  platform: "node",
  target: "node20",
  legalComments: "none",
});
