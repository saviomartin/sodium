import { rmSync, writeFileSync } from "node:fs";
import { STATE_PATH, adminClient, type E2eState } from "./helpers";

/**
 * Suite setup:
 *  - creates three EPHEMERAL auth users via the admin API (no passwords, no
 *    seeded accounts); the suite signs in with admin-issued magic-link tokens
 * Teardown deletes everything the suite created: the users, and any
 * personal workspaces made by Auth (cascading to repos, runs, manifests).
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const admin = adminClient();
  const stamp = Date.now().toString(36);
  const users = {} as E2eState["users"];
  for (const role of ["owner", "member", "outsider"] as const) {
    const email = `sodium-e2e-${role}-${stamp}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error || !data.user)
      throw new Error(`could not create e2e user ${email}: ${error?.message}`);
    users[role] = { id: data.user.id, email };
  }
  writeFileSync(
    STATE_PATH,
    JSON.stringify({ stamp, users } satisfies E2eState, null, 2),
  );

  return async () => {
    const userIds = Object.values(users).map((user) => user.id);
    const { data: orgs } = await admin
      .from("organizations")
      .select("id")
      .in("created_by", userIds);
    const orgIds = (orgs ?? []).map((org) => org.id);
    if (orgIds.length > 0) {
      await admin
        .from("sites")
        .update({ current_manifest_id: null })
        .in("org_id", orgIds);
      await admin.from("organizations").delete().in("id", orgIds);
    }
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
    rmSync(STATE_PATH, { force: true });
  };
}
