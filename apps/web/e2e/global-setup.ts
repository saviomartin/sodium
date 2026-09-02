import { writeFileSync } from "node:fs";
import { STATE_PATH, adminClient, type E2eState } from "./helpers";

/**
 * Suite setup:
 *  - creates three EPHEMERAL auth users via the admin API (no passwords, no
 *    seeded accounts); the suite signs in with admin-issued magic-link tokens
 * Teardown deletes the users; project data cascades from auth.users.
 */
export default async function globalSetup(): Promise<void> {
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

}
