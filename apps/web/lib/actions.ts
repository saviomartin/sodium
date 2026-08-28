"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import {
  ActionContractSchema,
  confirmationRank,
  minimumConfirmationFor,
  validateContract,
  type ActionContract,
} from "@sodium/contracts";
import { createClient, currentUserId } from "./supabase/server";
import { createServiceClient } from "./supabase/service";
import { publishSiteManifest, rollbackSiteManifest } from "./manifest";
import { env, hasGithubApp } from "./env";
import { listInstallationRepos, resolveRepositoryHead } from "./github";

const siteIdAlphabet = customAlphabet(
  "abcdefghijklmnopqrstuvwxyz0123456789",
  16,
);

export interface ActionResult {
  ok: boolean;
  error?: string;
  redirectTo?: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** Only internal paths are valid post-auth destinations. */
function safeNext(raw: unknown): string {
  const next = String(raw ?? "/dashboard");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

/**
 * GitHub is the only sign-in method. PKCE flow: Supabase hands back the
 * GitHub consent URL; after consent it redirects to /auth/callback, which
 * exchanges the code for a cookie session.
 */
export async function signInWithGithubAction(
  formData: FormData,
): Promise<void> {
  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${env.SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error || !data?.url) {
    redirect(
      `/login?error=${encodeURIComponent(error?.message ?? "could not start GitHub sign-in")}`,
    );
  }
  redirect(data.url);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

type ServiceClient = ReturnType<typeof createServiceClient>;

async function listArtifactPaths(
  service: ServiceClient,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await service.storage
      .from("artifacts")
      .list(prefix, { limit: 100, offset });
    if (error)
      throw new Error(`could not inspect stored artifacts: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const object of data) {
      const path = prefix ? `${prefix}/${object.name}` : object.name;
      if (object.id) paths.push(path);
      else paths.push(...(await listArtifactPaths(service, path)));
    }
    if (data.length < 100) break;
  }
  return paths;
}

/** Permanently removes every app-owned row, artifact and auth identity. */
export async function deleteAccountAction(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  const service = createServiceClient();
  const { data: workspaces, error: workspaceError } = await service
    .from("organizations")
    .select("id")
    .eq("created_by", user.id);
  if (workspaceError) return { ok: false, error: workspaceError.message };
  const workspaceIds = (workspaces ?? []).map((workspace) => workspace.id);

  try {
    const artifactPaths = (
      await Promise.all(
        workspaceIds.map((workspaceId) =>
          listArtifactPaths(service, workspaceId),
        ),
      )
    ).flat();
    for (let index = 0; index < artifactPaths.length; index += 100) {
      const { error } = await service.storage
        .from("artifacts")
        .remove(artifactPaths.slice(index, index + 100));
      if (error)
        throw new Error(`could not remove stored artifacts: ${error.message}`);
    }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "could not remove stored artifacts",
    };
  }

  if (workspaceIds.length > 0) {
    const { error: unlinkError } = await service
      .from("sites")
      .update({ current_manifest_id: null })
      .in("org_id", workspaceIds);
    if (unlinkError) return { ok: false, error: unlinkError.message };

    const { data: deleted, error: deleteError } = await service
      .from("organizations")
      .delete()
      .in("id", workspaceIds)
      .select("id");
    if (deleteError) return { ok: false, error: deleteError.message };
    if ((deleted?.length ?? 0) !== workspaceIds.length) {
      return {
        ok: false,
        error: "account data deletion was incomplete; no identity was removed",
      };
    }
  }

  const { error: authError } = await service.auth.admin.deleteUser(user.id);
  if (authError) {
    return {
      ok: false,
      error: `your app data was removed, but the sign-in identity could not be deleted: ${authError.message}`,
    };
  }
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?deleted=1");
}

// ---------------------------------------------------------------------------
// Internal personal workspace
// ---------------------------------------------------------------------------

/** Membership + role gate used by privileged mutations (user-context, RLS-scoped). */
async function requireOrgRole(
  orgId: string,
  roles: ("owner" | "admin" | "member")[],
): Promise<{ userId: string } | { error: string }> {
  const userId = await currentUserId();
  if (!userId) return { error: "not signed in" };
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !roles.includes(data.role as never))
    return { error: "you do not have permission to change this workspace" };
  return { userId };
}

async function requirePersonalWorkspace(): Promise<
  { userId: string; orgId: string } | { error: string }
> {
  const userId = await currentUserId();
  if (!userId) return { error: "not signed in" };
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_memberships")
    .select("org_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  const membership = data?.find((candidate) => candidate.role === "owner");
  if (!membership)
    return { error: "account setup is incomplete; sign out and sign in again" };
  return { userId, orgId: membership.org_id };
}

// ---------------------------------------------------------------------------
// GitHub connection
// ---------------------------------------------------------------------------

export async function connectGithubAction(): Promise<ActionResult> {
  const workspace = await requirePersonalWorkspace();
  if ("error" in workspace) return { ok: false, error: workspace.error };
  const gate = await requireOrgRole(workspace.orgId, ["owner", "admin"]);
  if ("error" in gate) return { ok: false, error: gate.error };
  if (!hasGithubApp() || !env.NEXT_PUBLIC_GITHUB_APP_SLUG) {
    return {
      ok: false,
      error:
        "GitHub App is not configured on this deployment (see README: GitHub App setup)",
    };
  }
  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(
    "sodium_gh_state",
    JSON.stringify({ state, orgId: workspace.orgId }),
    {
      httpOnly: true,
      secure: env.SITE_URL.startsWith("https://"),
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    },
  );
  redirect(
    `https://github.com/apps/${env.NEXT_PUBLIC_GITHUB_APP_SLUG}/installations/new?state=${state}`,
  );
}

const RepoSelectionSchema = z.object({
  installationUuid: z.string().uuid(),
  githubRepoId: z.coerce.number().int().positive(),
});

export async function selectRepositoryAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = RepoSelectionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false, error: "invalid repository selection" };
  const input = parsed.data;
  const supabase = await createClient();
  const { data: installation } = await supabase
    .from("github_installations")
    .select("id, org_id, installation_id, suspended_at")
    .eq("id", input.installationUuid)
    .maybeSingle();
  if (!installation || installation.suspended_at) {
    return {
      ok: false,
      error: "GitHub connection is unavailable; reconnect it and try again",
    };
  }
  const gate = await requireOrgRole(installation.org_id, ["owner", "admin"]);
  if ("error" in gate) return { ok: false, error: gate.error };

  let available;
  try {
    available = await listInstallationRepos(installation.installation_id);
  } catch {
    return {
      ok: false,
      error: "GitHub could not list repositories for this connection",
    };
  }
  const selected = available.find(
    (repository) => repository.githubRepoId === input.githubRepoId,
  );
  if (!selected) {
    return {
      ok: false,
      error: "that repository is not available to this GitHub connection",
    };
  }

  const { data: existing } = await supabase
    .from("repositories")
    .select("id")
    .eq("org_id", installation.org_id)
    .eq("github_repo_id", selected.githubRepoId)
    .maybeSingle();
  if (existing) redirect(`/repos/${existing.id}`);

  const { data: repo, error } = await supabase
    .from("repositories")
    .insert({
      org_id: installation.org_id,
      installation_id: input.installationUuid,
      github_repo_id: selected.githubRepoId,
      owner: selected.owner,
      name: selected.name,
      full_name: selected.fullName,
      default_branch: selected.defaultBranch,
      is_private: selected.isPrivate,
    })
    .select("id")
    .single();
  if (error || !repo) {
    // A second tab may have connected the same repository after our pre-read.
    // Converge on that row instead of surfacing a unique-constraint error.
    const { data: concurrent } = await supabase
      .from("repositories")
      .select("id")
      .eq("org_id", installation.org_id)
      .eq("github_repo_id", selected.githubRepoId)
      .maybeSingle();
    if (concurrent) redirect(`/repos/${concurrent.id}`);
    return {
      ok: false,
      error: error?.message ?? "could not connect repository",
    };
  }

  const { error: siteError } = await supabase.from("sites").insert({
    org_id: installation.org_id,
    repository_id: repo.id,
    site_id: `site_${siteIdAlphabet()}`,
    allowed_origins: [],
  });
  if (siteError) {
    await supabase.from("repositories").delete().eq("id", repo.id);
    return { ok: false, error: siteError.message };
  }

  redirect(`/repos/${repo.id}`);
}

// ---------------------------------------------------------------------------
// Preview environments
// ---------------------------------------------------------------------------

const EnvironmentSchema = z.object({
  repositoryId: z.string().uuid(),
  baseUrl: z.string().url(),
  authMode: z.enum(["none", "cookie", "basic"]),
  credential: z.string().max(2048).optional(),
});

export async function saveEnvironmentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = EnvironmentSchema.safeParse({
    repositoryId: formData.get("repositoryId"),
    baseUrl: formData.get("baseUrl"),
    authMode: formData.get("authMode"),
    credential: formData.get("credential") || undefined,
  });
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid input",
    };
  const input = parsed.data;
  if (input.authMode !== "none" && !input.credential) {
    return {
      ok: false,
      error: "credential required for the selected auth mode",
    };
  }

  const supabase = await createClient();
  const { data: repo } = await supabase
    .from("repositories")
    .select("id, org_id")
    .eq("id", input.repositoryId)
    .maybeSingle();
  if (!repo) return { ok: false, error: "repository not found" };
  const gate = await requireOrgRole(repo.org_id, ["owner", "admin"]);
  if ("error" in gate) return { ok: false, error: gate.error };

  const { data: environment, error } = await supabase
    .from("environments")
    .insert({
      repository_id: repo.id,
      org_id: repo.org_id,
      base_url: input.baseUrl,
      auth_mode: input.authMode,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  if (input.credential) {
    const { error: secretError } = await supabase.rpc(
      "set_preview_credential",
      {
        p_environment_id: environment.id,
        p_secret: input.credential,
      },
    );
    if (secretError)
      return {
        ok: false,
        error: `environment saved, but storing the credential failed: ${secretError.message}`,
      };
  }

  // Ensure the preview origin is allowed for the site (used by the loader).
  const origin = new URL(input.baseUrl).origin;
  const { data: site } = await supabase
    .from("sites")
    .select("id, allowed_origins")
    .eq("repository_id", repo.id)
    .maybeSingle();
  if (site && !site.allowed_origins.includes(origin)) {
    await supabase
      .from("sites")
      .update({ allowed_origins: [...site.allowed_origins, origin] })
      .eq("id", site.id);
  }

  revalidatePath(`/repos/${repo.id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export async function requestAnalysisAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const repositoryId = String(formData.get("repositoryId") ?? "");
  const environmentId = String(formData.get("environmentId") ?? "") || null;

  const supabase = await createClient();
  const { data: repo } = await supabase
    .from("repositories")
    .select(
      "id, org_id, owner, name, default_branch, github_installations(installation_id, suspended_at)",
    )
    .eq("id", repositoryId)
    .maybeSingle();
  if (!repo) return { ok: false, error: "repository not found" };

  const installation = repo.github_installations as unknown as {
    installation_id: number;
    suspended_at: string | null;
  } | null;
  if (!installation || installation.suspended_at) {
    return {
      ok: false,
      error: "GitHub connection is unavailable; reconnect it and try again",
    };
  }

  const { data: activeRuns } = await supabase
    .from("analysis_runs")
    .select("id, created_at")
    .eq("repository_id", repositoryId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1);
  const activeRun = activeRuns?.[0];
  if (activeRun) {
    const age = Date.now() - new Date(activeRun.created_at).getTime();
    if (age < 30 * 60 * 1000) {
      redirect(`/repos/${repositoryId}/runs/${activeRun.id}`);
    }
    await createServiceClient()
      .from("analysis_runs")
      .update({
        status: "failed",
        error: {
          code: "stale_run",
          message:
            "The worker stopped reporting progress. A fresh analysis was started.",
          retryable: true,
        },
        finished_at: new Date().toISOString(),
      })
      .eq("id", activeRun.id)
      .in("status", ["queued", "running"]);
  }

  let sha: string;
  try {
    sha = await resolveRepositoryHead(
      installation.installation_id,
      repo.owner,
      repo.name,
      repo.default_branch,
    );
  } catch {
    return {
      ok: false,
      error: `GitHub could not resolve the latest commit on ${repo.default_branch}`,
    };
  }

  const { data: runId, error } = await supabase.rpc("request_analysis", {
    p_repository_id: repositoryId,
    p_commit_sha: sha,
    p_ref: repo.default_branch,
    p_environment_id: environmentId ?? undefined,
  });
  if (error) return { ok: false, error: error.message };
  redirect(`/repos/${repositoryId}/runs/${runId as string}`);
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export async function reviewCandidateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const candidateId = String(formData.get("candidateId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 1000);
  if (!["rejected", "needs_review"].includes(decision))
    return { ok: false, error: "invalid decision" };

  const userId = await currentUserId();
  const supabase = await createClient();
  const { error, data } = await supabase
    .from("action_candidates")
    .update({
      status: decision as "rejected" | "needs_review",
      review_note: note || null,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", candidateId)
    .select("id, run_id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0)
    return { ok: false, error: "not permitted (owner or admin role required)" };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function approveCandidateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const candidateId = String(formData.get("candidateId") ?? "");
  const siteId = String(formData.get("siteId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_candidate", {
    p_candidate_id: candidateId,
    p_site_id: siteId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

const ToolAvailabilitySchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1).max(128),
  siteId: z.string().uuid(),
  enabled: z.boolean(),
});

/**
 * The repo-page toggle is the complete review flow: validate ownership, update
 * immutable contract lineage, and immediately publish the resulting tool set.
 */
export async function setCandidatesEnabledAction(
  candidateIds: string[],
  siteId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const parsed = ToolAvailabilitySchema.safeParse({
    candidateIds: [...new Set(candidateIds)],
    siteId,
    enabled,
  });
  if (!parsed.success) return { ok: false, error: "invalid tool selection" };
  const input = parsed.data;

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, repository_id, allowed_origins")
    .eq("id", input.siteId)
    .maybeSingle();
  if (!site) return { ok: false, error: "site not found" };
  const gate = await requireOrgRole(site.org_id, ["owner", "admin"]);
  if ("error" in gate) return { ok: false, error: gate.error };
  if (input.enabled && site.allowed_origins.length === 0) {
    return {
      ok: false,
      error: "Add your app URL before enabling tools.",
    };
  }

  const { data: candidates, error: candidatesError } = await supabase
    .from("action_candidates")
    .select("id, org_id, run_id, action_id, status")
    .in("id", input.candidateIds);
  if (candidatesError) return { ok: false, error: candidatesError.message };
  if (!candidates || candidates.length !== input.candidateIds.length) {
    return { ok: false, error: "one or more tools were not found" };
  }
  if (candidates.some((candidate) => candidate.org_id !== site.org_id)) {
    return { ok: false, error: "tool selection does not belong to this site" };
  }

  const runIds = [...new Set(candidates.map((candidate) => candidate.run_id))];
  const { data: runs, error: runsError } = await supabase
    .from("analysis_runs")
    .select("id, repository_id")
    .in("id", runIds);
  if (runsError) return { ok: false, error: runsError.message };
  if (
    !runs ||
    runs.length !== runIds.length ||
    runs.some((run) => run.repository_id !== site.repository_id)
  ) {
    return { ok: false, error: "tool selection does not belong to this repository" };
  }

  const service = createServiceClient();
  if (input.enabled) {
    for (const candidate of candidates) {
      const { data: existing, error: existingError } = await service
        .from("tool_contracts")
        .select("id, status")
        .eq("site_id", site.id)
        .eq("action_id", candidate.action_id)
        .maybeSingle();
      if (existingError) return { ok: false, error: existingError.message };

      if (
        existing &&
        (candidate.status === "approved" || candidate.status === "published")
      ) {
        const { error } = await service
          .from("tool_contracts")
          .update({ status: "active" })
          .eq("id", existing.id);
        if (error) return { ok: false, error: error.message };
        continue;
      }

      if (candidate.status === "rejected") {
        const { error } = await service
          .from("action_candidates")
          .update({ status: "needs_review" })
          .eq("id", candidate.id);
        if (error) return { ok: false, error: error.message };
      } else if (
        candidate.status !== "proposed" &&
        candidate.status !== "needs_review"
      ) {
        return {
          ok: false,
          error: `${candidate.action_id} cannot be enabled from its current state`,
        };
      }

      const { error } = await supabase.rpc("approve_candidate", {
        p_candidate_id: candidate.id,
        p_site_id: site.id,
      });
      if (error) return { ok: false, error: error.message };
    }
  } else {
    const actionIds = candidates.map((candidate) => candidate.action_id);
    const { error: contractsError } = await service
      .from("tool_contracts")
      .update({ status: "retired" })
      .eq("site_id", site.id)
      .in("action_id", actionIds);
    if (contractsError) return { ok: false, error: contractsError.message };

    const { error: candidateError } = await service
      .from("action_candidates")
      .update({
        status: "rejected",
        reviewed_by: gate.userId,
        reviewed_at: new Date().toISOString(),
      })
      .in("id", input.candidateIds);
    if (candidateError) return { ok: false, error: candidateError.message };

    const { error: auditError } = await service.from("audit_events").insert({
      org_id: site.org_id,
      actor: gate.userId,
      action: "candidate.disabled",
      subject_type: "site",
      subject_id: site.id,
      data: {
        candidateIds: input.candidateIds,
        actionIds,
      } as never,
    });
    if (auditError) return { ok: false, error: auditError.message };
  }

  const publication = await publishSiteManifest(site.id, gate.userId);
  if (!publication.ok) {
    return {
      ok: false,
      error: `Tool settings changed, but availability could not update: ${publication.error}`,
    };
  }

  revalidatePath(`/repos/${site.repository_id}`);
  return { ok: true };
}

const CandidateEditSchema = z.object({
  candidateId: z.string().uuid(),
  title: z.string().min(3).max(120),
  description: z.string().min(10).max(1024),
  confirmation: z.enum(["none", "recommended", "required"]),
});

/**
 * Reviewer edits to agent-facing wording and confirmation policy. Runs the
 * full deterministic validation on the edited contract; the confirmation
 * floor for the risk level cannot be lowered. Applied via the service client
 * (the immutability trigger blocks direct client rewrites by design) after an
 * explicit role check, and resets the candidate to needs_review.
 */
export async function editCandidateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = CandidateEditSchema.safeParse({
    candidateId: formData.get("candidateId"),
    title: formData.get("title"),
    description: formData.get("description"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid input",
    };
  const input = parsed.data;

  const supabase = await createClient();
  const { data: candidate } = await supabase
    .from("action_candidates")
    .select("id, org_id, status, contract")
    .eq("id", input.candidateId)
    .maybeSingle();
  if (!candidate) return { ok: false, error: "candidate not found" };
  if (!["proposed", "needs_review"].includes(candidate.status)) {
    return {
      ok: false,
      error: `candidate is ${candidate.status}; only unreviewed candidates can be edited`,
    };
  }
  const gate = await requireOrgRole(candidate.org_id, ["owner", "admin"]);
  if ("error" in gate) return { ok: false, error: gate.error };

  const contract = ActionContractSchema.parse(candidate.contract);
  if (
    confirmationRank(input.confirmation) <
    confirmationRank(minimumConfirmationFor(contract.riskLevel))
  ) {
    return {
      ok: false,
      error: `confirmation cannot be below "${minimumConfirmationFor(contract.riskLevel)}" for ${contract.riskLevel} actions`,
    };
  }
  const edited: ActionContract = {
    ...contract,
    title: input.title,
    description: input.description,
    confirmation: input.confirmation,
  };
  const validation = validateContract(edited);
  if (!validation.ok) {
    return {
      ok: false,
      error: `edit rejected: ${validation.issues.find((issue) => issue.severity === "error")?.message}`,
    };
  }

  const service = createServiceClient();
  const { error } = await service
    .from("action_candidates")
    .update({
      title: edited.title,
      description: edited.description,
      confirmation: edited.confirmation,
      contract: edited as never,
      status: "needs_review",
      validation_issues: validation.issues as never,
      reviewed_by: gate.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.candidateId);
  if (error) return { ok: false, error: error.message };

  await service.from("audit_events").insert({
    org_id: candidate.org_id,
    actor: gate.userId,
    action: "candidate.edited",
    subject_type: "action_candidate",
    subject_id: input.candidateId,
    data: { fields: ["title", "description", "confirmation"] } as never,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Publication
// ---------------------------------------------------------------------------

export async function publishSiteAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const siteUuid = String(formData.get("siteId") ?? "");
  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, allowed_origins")
    .eq("id", siteUuid)
    .maybeSingle();
  if (!site) return { ok: false, error: "site not found" };
  if (site.allowed_origins.length === 0) {
    return {
      ok: false,
      error: "configure at least one allowed origin before publishing",
    };
  }
  const gate = await requireOrgRole(site.org_id, ["owner", "admin"]);
  if ("error" in gate) return { ok: false, error: gate.error };

  const result = await publishSiteManifest(siteUuid, gate.userId);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function rollbackManifestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const siteUuid = String(formData.get("siteId") ?? "");
  const manifestId = String(formData.get("manifestId") ?? "");
  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", siteUuid)
    .maybeSingle();
  if (!site) return { ok: false, error: "site not found" };
  const gate = await requireOrgRole(site.org_id, ["owner", "admin"]);
  if ("error" in gate) return { ok: false, error: gate.error };

  const result = await rollbackSiteManifest(siteUuid, manifestId, gate.userId);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function generateIntegrationPrAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const siteUuid = String(formData.get("siteId") ?? "");
  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, repository_id")
    .eq("id", siteUuid)
    .maybeSingle();
  if (!site) return { ok: false, error: "site not found" };
  const gate = await requireOrgRole(site.org_id, ["owner", "admin"]);
  if ("error" in gate) return { ok: false, error: gate.error };

  const service = createServiceClient();
  const { data: pr, error } = await service
    .from("integration_prs")
    .insert({
      repository_id: site.repository_id,
      org_id: site.org_id,
      site_id: site.id,
      branch: "pending",
      created_by: gate.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const { error: enqueueError } = await service.rpc("enqueue_job", {
    p_message: {
      type: "publication.generate_pr",
      publicationId: pr.id,
      attempt: 0,
    } as never,
  });
  if (enqueueError) return { ok: false, error: enqueueError.message };

  await service.from("audit_events").insert({
    org_id: site.org_id,
    actor: gate.userId,
    action: "integration_pr.requested",
    subject_type: "integration_pr",
    subject_id: pr.id,
    data: {} as never,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Site settings
// ---------------------------------------------------------------------------

export async function updateSiteOriginsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const siteUuid = String(formData.get("siteId") ?? "");
  const raw = String(formData.get("origins") ?? "");
  const origins = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (origins.length === 0 || origins.length > 8)
    return { ok: false, error: "provide 1–8 origins" };
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (url.origin !== origin)
        return {
          ok: false,
          error: `"${origin}" must be a bare origin (scheme://host[:port])`,
        };
    } catch {
      return { ok: false, error: `"${origin}" is not a valid origin` };
    }
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sites")
    .update({ allowed_origins: origins })
    .eq("id", siteUuid)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0)
    return { ok: false, error: "not permitted (owner or admin role required)" };
  revalidatePath("/", "layout");
  return { ok: true };
}
