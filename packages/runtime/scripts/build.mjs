import { build } from "esbuild";
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: {
    index: join(root, "src", "sdk.ts"),
    react: join(root, "src", "react.tsx"),
  },
  outdir: join(root, "dist"),
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2022"],
  legalComments: "none",
  external: ["react"],
});

for (const file of ["index.js", "react.js"]) {
  const size = statSync(join(root, "dist", file)).size;
  const maxBytes = 80 * 1024;
  console.log(`dist/${file}: ${(size / 1024).toFixed(1)} KiB`);
  if (size > maxBytes) {
    throw new Error(
      `${file} exceeds the ${maxBytes} byte minified bundle budget`,
    );
  }
}
