import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";

const developmentSigningKey = JSON.parse(
  readFileSync(
    new URL(
      "../../packages/runtime/keys/dev-deployment-key.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { keyId: string; privateKeyPem: string };

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const automationBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./e2e",
  timeout: 300_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "line" : "list",
  globalSetup: "./e2e/global-setup",
  globalTeardown: "./e2e/global-teardown",
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:3100",
    extraHTTPHeaders: automationBypass
      ? { "x-vercel-protection-bypass": automationBypass }
      : undefined,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externalBaseUrl
    ? undefined
    : {
        command:
          "node ../../packages/runtime/scripts/build.mjs && corepack pnpm exec next build && corepack pnpm exec next start --port 3100",
        env: {
          NEXT_DIST_DIR: ".next-e2e",
          NEXT_PUBLIC_SODIUM_ENVIRONMENT: "development",
          SITE_URL: "http://localhost:3100",
          MANIFEST_SIGNING_KEY_ID: developmentSigningKey.keyId,
          MANIFEST_SIGNING_PRIVATE_KEY: developmentSigningKey.privateKeyPem,
        },
        port: 3100,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
