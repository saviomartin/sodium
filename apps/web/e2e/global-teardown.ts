import { existsSync, rmSync } from "node:fs";
import { STATE_PATH, adminClient, readState } from "./helpers";

export default async function globalTeardown(): Promise<void> {
  if (!existsSync(STATE_PATH)) return;

  const { users } = readState();
  const admin = adminClient();
  for (const { id } of Object.values(users)) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
  rmSync(STATE_PATH, { force: true });
}
