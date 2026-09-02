import { chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(root, "dist", "bin.js");
await build({
  entryPoints: [join(root, "src", "bin.ts")],
  outfile,
  bundle: true,
  external: ["clipboardy", "ink", "react", "react/jsx-runtime"],
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
});
await chmod(outfile, 0o755);
