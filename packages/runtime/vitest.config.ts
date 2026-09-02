import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const deploymentKeys = JSON.parse(
  readFileSync(
    new URL("./keys/dev-deployment-jwks.json", import.meta.url),
    "utf8",
  ),
);

export default defineConfig({
  define: {
    __SODIUM_DEPLOYMENT_KEYS__: JSON.stringify(deploymentKeys),
  },
  test: {
    include: ["test/**/*.test.ts"],
    environmentOptions: {
      happyDOM: {
        url: "http://localhost:4000/",
      },
    },
  },
});
