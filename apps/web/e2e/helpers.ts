import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
export const STATE_PATH = join(here, ".state.json");

export interface E2eState {
  stamp: string;
  users: Record<"owner" | "member" | "outsider", { id: string; email: string }>;
}

export function loadWebEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(join(here, "..", ".env.local"), "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) env[match[1]!] = match[2]!;
  }
  return env;
}

/** Service-role client for test provisioning/teardown (never in the browser). */
export function adminClient(): SupabaseClient {
  const env = loadWebEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function readState(): E2eState {
  return JSON.parse(readFileSync(STATE_PATH, "utf8")) as E2eState;
}

/**
 * Signs the browser in as an ephemeral test user WITHOUT passwords: the auth
 * admin API issues a magic-link token, and the app's own /auth/confirm route
 * (the standard @supabase/ssr token-hash verifier) turns it into a real
 * cookie session — the same machinery emailed links use in production.
 */
export async function signIn(page: Page, email: string): Promise<void> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) {
    throw new Error(`could not generate sign-in token for ${email}: ${error?.message}`);
  }
  await page.context().clearCookies();
  await page.goto(
    `/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink&next=/dashboard`,
  );
  await page.waitForURL("**/dashboard");
}
