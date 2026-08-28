import "server-only";
import { createClient } from "./supabase/server";

/** User-context reads (RLS-scoped). Server components only. */

export async function getAccountContext() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = (userData?.claims?.sub as string | undefined) ?? null;
  const email = (userData?.claims?.email as string | undefined) ?? "";
  if (!userId) return { userId: null, email: "", workspaceId: null };

  const { data } = await supabase
    .from("org_memberships")
    .select("org_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  const owned = data?.find((membership) => membership.role === "owner");
  return {
    userId,
    email,
    workspaceId: owned?.org_id ?? data?.[0]?.org_id ?? null,
  };
}

export async function getRepositories() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("repositories")
    .select(
      "id, full_name, default_branch, is_private, created_at, github_repo_id",
    )
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getRepository(repoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("repositories")
    .select(
      "id, org_id, full_name, owner, name, default_branch, github_repo_id, installation_id",
    )
    .eq("id", repoId)
    .maybeSingle();
  return data;
}

export async function getEnvironments(repoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("environments")
    .select("id, base_url, auth_mode, credential_secret_id, created_at")
    .eq("repository_id", repoId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getSiteForRepository(repoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sites")
    .select("id, site_id, allowed_origins, current_manifest_id, org_id")
    .eq("repository_id", repoId)
    .maybeSingle();
  return data;
}

export async function getRuns(repoId: string, limit = 10) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("analysis_runs")
    .select(
      "id, status, stage, stage_statuses, error, created_at, finished_at, repository_commits(sha, ref)",
    )
    .eq("repository_id", repoId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getRun(runId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("analysis_runs")
    .select(
      "id, repository_id, org_id, status, stage, stage_statuses, error, created_at, finished_at, environment_id, repository_commits(sha, ref)",
    )
    .eq("id", runId)
    .maybeSingle();
  return data;
}

export async function getCandidates(runId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("action_candidates")
    .select(
      "id, action_id, name, title, description, risk_level, confirmation, confidence, status, validation_issues, review_note, created_at, contract",
    )
    .eq("run_id", runId)
    .order("confidence", { ascending: false });
  return data ?? [];
}

/** passed/failed eval counts per candidate for one run. */
export async function getEvalSummaries(
  runId: string,
): Promise<Map<string, { passed: number; failed: number }>> {
  const supabase = await createClient();
  const { data: candidates } = await supabase
    .from("action_candidates")
    .select("id")
    .eq("run_id", runId);
  const ids = (candidates ?? []).map((row) => row.id);
  const summaries = new Map<string, { passed: number; failed: number }>();
  if (ids.length === 0) return summaries;
  const { data: evals } = await supabase
    .from("eval_runs")
    .select("candidate_id, passed")
    .in("candidate_id", ids);
  for (const row of evals ?? []) {
    const entry = summaries.get(row.candidate_id) ?? { passed: 0, failed: 0 };
    if (row.passed) entry.passed++;
    else entry.failed++;
    summaries.set(row.candidate_id, entry);
  }
  return summaries;
}

export async function getCandidate(candidateId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("action_candidates")
    .select("*, analysis_runs(id, repository_id)")
    .eq("id", candidateId)
    .maybeSingle();
  return data;
}

export async function getEvalRuns(candidateId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("eval_runs")
    .select("name, passed, details, created_at")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getToolContracts(siteUuid: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tool_contracts")
    .select("id, action_id, name, status, latest_version_id, created_at")
    .eq("site_id", siteUuid)
    .order("name");
  return data ?? [];
}

export async function getCompatFindings(repoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("compat_findings")
    .select("id, commit_sha, finding, severity, status, created_at")
    .eq("repository_id", repoId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function getInstallations() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("github_installations")
    .select(
      "id, org_id, installation_id, account_login, suspended_at, created_at",
    )
    .order("created_at", { ascending: false });
  return data ?? [];
}
