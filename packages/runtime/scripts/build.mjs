import { build } from "esbuild";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isRelease = process.argv.includes("--release");
const deploymentKeys = process.env.SODIUM_MANIFEST_JWKS
  ? JSON.parse(process.env.SODIUM_MANIFEST_JWKS)
  : JSON.parse(
      readFileSync(
        join(
          root,
          "keys",
          isRelease
            ? "production-deployment-jwks.json"
            : "dev-deployment-jwks.json",
        ),
        "utf8",
      ),
    );
if (Object.keys(deploymentKeys).length === 0) {
  throw new Error("no deployment verification keys provided");
}
if (
  isRelease &&
  Object.keys(deploymentKeys).some((keyId) => keyId.startsWith("dev-insecure"))
) {
  throw new Error("SDK release builds require production verification keys");
}

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
  define: {
    __SODIUM_DEPLOYMENT_KEYS__: JSON.stringify(deploymentKeys),
  },
});

for (const file of ["index.js", "react.js"]) {
  const outputPath = join(root, "dist", file);
  const size = statSync(outputPath).size;
  const maxBytes = 80 * 1024;
  console.log(`dist/${file}: ${(size / 1024).toFixed(1)} KiB`);
  if (size > maxBytes) {
    throw new Error(
      `${file} exceeds the ${maxBytes} byte minified bundle budget`,
    );
  }
  if (isRelease && readFileSync(outputPath, "utf8").includes("dev-insecure")) {
    throw new Error(`${file} contains a development deployment key`);
  }
}
