import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Spawns the background worker for the duration of the browser suite so
 * queued analysis and PR-generation jobs actually execute.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const workerDir = join(__dirname, "..", "..", "worker");
  const worker: ChildProcess = spawn(
    "corepack",
    ["pnpm", "exec", "tsx", "--env-file=.env", "src/main.ts"],
    { cwd: workerDir, stdio: ["ignore", "inherit", "inherit"] },
  );
  await new Promise((resolve) => setTimeout(resolve, 3000));
  if (worker.exitCode !== null) {
    throw new Error(
      `worker exited during setup with code ${worker.exitCode} — is apps/worker/.env configured?`,
    );
  }
  return async () => {
    worker.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (worker.exitCode === null) worker.kill("SIGKILL");
  };
}
