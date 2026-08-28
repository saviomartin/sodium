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

const siteIdAlphabet = customAlphabet(
  "abcdefghijklmnopqrstuvwxyz0123456789",
  16,
);

export interface ActionResult {
  ok: boolean;
  error?: string;
  redirectTo?: string;
}

const FIXTURE_SHA = "f".repeat(40);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function signInAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  redirect(String(formData.get("next") ?? "/dashboard"));
}

export async function signUpAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8)
    return { ok: false, error: "password must be at least 8 characters" };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { ok: false, error: error.message };
  if (!data.session) {
    return {
      ok: true,
      error: "Check your email to confirm your account, then sign in.",
    };
  }
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

const OrgSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(2)
    .max(48)
    .regex(
      /^[a-z0-9](-?[a-z0-9])*$/,
      "lowercase letters, digits and single dashes",
    ),
});

export async function createOrganizationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = OrgSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid input",
    };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
  });
  if (error) {
    return {
      ok: false,
      error: error.message.includes("duplicate")
        ? "that slug is taken"
        : error.message,
    };
  }
  redirect(`/dashboard?org=${parsed.data.slug}`);
}

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
    return { error: "requires elevated permissions in this organization" };
  return { userId };
}

// ---------------------------------------------------------------------------
// GitHub connection
// ---------------------------------------------------------------------------

export async function connectGithubAction(
  orgId: string,
): Promise<ActionResult> {
  const gate = await requireOrgRole(orgId, ["owner", "admin"]);
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
  cookieStore.set("sodium_gh_state", JSON.stringify({ state, orgId }), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  redirect(
    `https://github.com/apps/${env.NEXT_PUBLIC_GITHUB_APP_SLUG}/installations/new?state=${state}`,
  );
}

/**
 * Local-development path: registers the seeded fixture repository (analyzed
 * from FIXTURE_REPO_DIR by the worker) for an organization without GitHub
 * credentials. Fixture installations use non-positive installation ids.
 */
export async function connectFixtureRepoAction(
  orgId: string,
): Promise<ActionResult> {
  const gate = await requireOrgRole(orgId, ["owner", "admin"]);
  if ("error" in gate) return { ok: false, error: gate.error };
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("repositories")
    .select("id")
    .eq("org_id", orgId)
    .eq("github_repo_id", 0)
    .maybeSingle();
  if (existing) return { ok: true, redirectTo: `/repos/${existing.id}` };

  const fixtureInstallationId = -Math.floor(Math.random() * 2_000_000_000) - 1;
  const { data: installation, error: installError } = await supabase
    .from("github_installations")
    .insert({
      org_id: orgId,
      installation_id: fixtureInstallationId,
      account_login: "local-fixture",
      account_type: "User",
      created_by: gate.userId,
    })
    .select("id")
    .single();
  if (installError) return { ok: false, error: installError.message };

  const { data: repo, error: repoError } = await supabase
    .from("repositories")
    .insert({
      org_id: orgId,
      installation_id: installation.id,
      github_repo_id: 0,
      owner: "local-fixture",
      name: "fixture-shop",
      full_name: "local-fixture/fixture-shop",
      default_branch: "main",
      is_private: false,
    })
    .select("id")
    .single();
  if (repoError) return { ok: false, error: repoError.message };

  const { error: siteError } = await supabase.from("sites").insert({
    org_id: orgId,
    repository_id: repo.id,
    site_id: `site_${siteIdAlphabet()}`,
    allowed_origins: ["http://localhost:4000"],
  });
  if (siteError) return { ok: false, error: siteError.message };

  redirect(`/repos/${repo.id}`);
}

const RepoSelectionSchema = z.object({
  orgId: z.string().uuid(),
  installationUuid: z.string().uuid(),
  githubRepoId: z.coerce.number().int(),
  owner: z.string().min(1),
  name: z.string().min(1),
  fullName: z.string().min(1),
  defaultBranch: z.string().min(1),
  isPrivate: z.coerce.boolean(),
});

export async function selectRepositoryAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = RepoSelectionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false, error: "invalid repository selection" };
  const input = parsed.data;
  const gate = await requireOrgRole(input.orgId, ["owner", "admin"]);
  if ("error" in gate) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const { data: repo, error } = await supabase
    .from("repositories")
    .insert({
      org_id: input.orgId,
      installation_id: input.installationUuid,
      github_repo_id: input.githubRepoId,
      owner: input.owner,
      name: input.name,
      full_name: input.fullName,
      default_branch: input.defaultBranch,
      is_private: input.isPrivate,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const { error: siteError } = await supabase.from("sites").insert({
    org_id: input.orgId,
    repository_id: repo.id,
    site_id: `site_${siteIdAlphabet()}`,
    allowed_origins: [],
  });
  if (siteError) return { ok: false, error: siteError.message };

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
  let sha = String(formData.get("sha") ?? "")
    .trim()
    .toLowerCase();

  const supabase = await createClient();
  const { data: repo } = await supabase
    .from("repositories")
    .select("id, org_id, github_repo_id")
    .eq("id", repositoryId)
    .maybeSingle();
  if (!repo) return { ok: false, error: "repository not found" };

  if (!sha) sha = repo.github_repo_id === 0 ? FIXTURE_SHA : "";
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    return {
      ok: false,
      error: "provide a full 40-character commit SHA to analyze",
    };
  }

  const { data: runId, error } = await supabase.rpc("request_analysis", {
    p_repository_id: repositoryId,
    p_commit_sha: sha,
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
