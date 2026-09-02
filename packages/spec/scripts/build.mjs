import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await build({
  entryPoints: {
    index: join(root, "src", "index.ts"),
    signing: join(root, "src", "signing.ts"),
  },
  outdir: join(root, "dist"),
  bundle: true,
  minify: true,
  format: "esm",
  platform: "node",
  target: "node20",
  legalComments: "none",
});
