import { spawn, type ChildProcess } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STATE_PATH, adminClient, type E2eState } from "./helpers";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Suite setup:
 *  - creates three EPHEMERAL auth users via the admin API (no passwords, no
 *    seeded accounts); the suite signs in with admin-issued magic-link tokens
 *  - spawns the background worker so queued jobs actually execute
 * Teardown deletes everything the suite created: the users, and any
 * organizations they made (cascading to repos, runs, manifests).
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const admin = adminClient();
  const stamp = Date.now().toString(36);
  const users = {} as E2eState["users"];
  for (const role of ["owner", "member", "outsider"] as const) {
    const email = `sodium-e2e-${role}-${stamp}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user) throw new Error(`could not create e2e user ${email}: ${error?.message}`);
    users[role] = { id: data.user.id, email };
  }
  writeFileSync(STATE_PATH, JSON.stringify({ stamp, users } satisfies E2eState, null, 2));

  const workerDir = join(__dirname, "..", "..", "worker");
  const worker: ChildProcess = spawn(
    "corepack",
    ["pnpm", "exec", "tsx", "--env-file=.env", "src/main.ts"],
    { cwd: workerDir, stdio: ["ignore", "inherit", "inherit"] },
  );
  await new Promise((resolve) => setTimeout(resolve, 3000));
  if (worker.exitCode !== null) {
    throw new Error(`worker exited during setup with code ${worker.exitCode} — is apps/worker/.env configured?`);
  }

  return async () => {
    worker.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (worker.exitCode === null) worker.kill("SIGKILL");

    const userIds = Object.values(users).map((user) => user.id);
    const { data: orgs } = await admin.from("organizations").select("id").in("created_by", userIds);
    const orgIds = (orgs ?? []).map((org) => org.id);
    if (orgIds.length > 0) {
      await admin.from("sites").update({ current_manifest_id: null }).in("org_id", orgIds);
      await admin.from("organizations").delete().in("id", orgIds);
    }
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
    rmSync(STATE_PATH, { force: true });
  };
}
