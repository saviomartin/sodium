import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { env } from "./env";
import { listAppInstallations, type InstallationInfo } from "./github";
import { manageableGithubInstallations } from "./github-access";
import { createClient, currentUserId } from "./supabase/server";

const CONNECTION_COOKIE = "sodium_gh_state";
const ConnectionStateSchema = z.object({
  state: z.string().length(32),
  orgId: z.string().uuid(),
  candidateInstallationId: z.number().int().positive().optional(),
});

type ConnectionState = z.infer<typeof ConnectionStateSchema>;

export type GithubRecoveryResult =
  | { kind: "connected"; installationId: number }
  | { kind: "install"; state: string }
  | {
      kind: "error";
      code: "github_state" | "github_access" | "github_store";
    };

async function writeConnectionState(value: ConnectionState): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CONNECTION_COOKIE, JSON.stringify(value), {
    httpOnly: true,
    secure: env.SITE_URL.startsWith("https://"),
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
}

export async function readGithubConnectionState(
  expectedState: string,
): Promise<ConnectionState | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(CONNECTION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = ConnectionStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.state !== expectedState) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

async function clearGithubConnectionState(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CONNECTION_COOKIE);
}

async function createGithubConnectionState(
  orgId: string,
  candidateInstallationId?: number,
): Promise<string> {
  const state = randomBytes(16).toString("hex");
  await writeConnectionState({ state, orgId, candidateInstallationId });
  return state;
}

/** Starts a fresh installation flow without reusing an existing account. */
export async function createGithubInstallationState(
  orgId: string,
): Promise<string> {
  return createGithubConnectionState(orgId);
}

/** Starts a short-lived GitHub OAuth check and returns its consent URL. */
export async function createGithubAuthorization(
  orgId: string,
  candidateInstallationId?: number,
): Promise<{ state: string; url: string }> {
  const state = randomBytes(16).toString("hex");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${env.SITE_URL}/auth/callback?github_state=${state}`,
      scopes: "read:user user:email read:org",
    },
  });
  if (error || !data.url) {
    throw new Error(error?.message ?? "could not start GitHub authorization");
  }
  await writeConnectionState({ state, orgId, candidateInstallationId });
  return { state, url: data.url };
}

/** Reuses the provider token from the initial sign-in to skip another OAuth screen. */
export async function connectGithubWithProviderToken(
  orgId: string,
  providerToken: string,
): Promise<GithubRecoveryResult> {
  const state = await createGithubConnectionState(orgId);
  return recoverGithubConnection(state, providerToken);
}

/** Binds the App setup callback to the exact installation GitHub returned. */
export async function recoverGithubInstallationWithProviderToken(
  expectedState: string,
  installationId: number,
  providerToken: string,
): Promise<GithubRecoveryResult> {
  const connection = await readGithubConnectionState(expectedState);
  if (!connection) return { kind: "error", code: "github_state" };
  await writeConnectionState({
    ...connection,
    candidateInstallationId: installationId,
  });
  return recoverGithubConnection(expectedState, providerToken);
}

/**
 * Links only installations the freshly authorized GitHub user can manage.
 * Organization installations require an active admin membership.
 */
export async function recoverGithubConnection(
  expectedState: string,
  providerToken: string,
): Promise<GithubRecoveryResult> {
  const connection = await readGithubConnectionState(expectedState);
  if (!connection) return { kind: "error", code: "github_state" };

  const userId = await currentUserId();
  if (!userId) return { kind: "error", code: "github_state" };
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("org_id", connection.orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    await clearGithubConnectionState();
    return { kind: "error", code: "github_access" };
  }

  let manageable: InstallationInfo[];
  try {
    manageable = await manageableGithubInstallations(
      await listAppInstallations(),
      providerToken,
    );
  } catch {
    await clearGithubConnectionState();
    return { kind: "error", code: "github_access" };
  }

  if (connection.candidateInstallationId) {
    manageable = manageable.filter(
      (installation) =>
        installation.installationId === connection.candidateInstallationId,
    );
    if (manageable.length === 0) {
      await clearGithubConnectionState();
      return { kind: "error", code: "github_access" };
    }
  } else if (manageable.length === 0) {
    // Preserve the original state cookie through GitHub's install screen.
    return { kind: "install", state: connection.state };
  }

  const installationIds = manageable.map(
    (installation) => installation.installationId,
  );
  const { data: existing, error: existingError } = await supabase
    .from("github_installations")
    .select("installation_id")
    .in("installation_id", installationIds);
  if (existingError) {
    await clearGithubConnectionState();
    return { kind: "error", code: "github_store" };
  }
  const existingIds = new Set(
    (existing ?? []).map((installation) => installation.installation_id),
  );
  const missing = manageable.filter(
    (installation) => !existingIds.has(installation.installationId),
  );
  if (missing.length > 0) {
    const { error } = await supabase.from("github_installations").insert(
      missing.map((installation) => ({
        org_id: connection.orgId,
        installation_id: installation.installationId,
        account_login: installation.accountLogin,
        account_type: installation.accountType,
        created_by: userId,
      })),
    );
    if (error) {
      await clearGithubConnectionState();
      return { kind: "error", code: "github_store" };
    }
  }

  await clearGithubConnectionState();
  return { kind: "connected", installationId: manageable[0]!.installationId };
}
