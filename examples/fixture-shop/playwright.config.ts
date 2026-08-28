import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1, // shared in-memory store: keep executions ordered
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://localhost:4000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      "node ../../packages/runtime/scripts/build.mjs && corepack pnpm exec next dev --port 4000",
    port: 4000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
