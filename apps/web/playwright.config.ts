import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";

const e2eSigningKey = JSON.parse(
  readFileSync(
    new URL(
      "../../packages/runtime/keys/dev-manifest-key.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { privateKeyPem: string };

export default defineConfig({
  testDir: "./e2e",
  timeout: 300_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "line" : "list",
  globalSetup: "./e2e/global-setup",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      "node ../../packages/runtime/scripts/build.mjs && corepack pnpm exec next build && corepack pnpm exec next start --port 3100",
    env: {
      GITHUB_APP_ID: "4758809",
      GITHUB_APP_PRIVATE_KEY: "e2e-placeholder-".padEnd(120, "x"),
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_GITHUB_APP_SLUG: "sodium-local-development",
      NEXT_PUBLIC_SODIUM_ENVIRONMENT: "development",
      SITE_URL: "http://localhost:3100",
      MANIFEST_SIGNING_KEY_ID: "e2e-test",
      MANIFEST_SIGNING_PRIVATE_KEY: e2eSigningKey.privateKeyPem,
    },
    port: 3100,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
