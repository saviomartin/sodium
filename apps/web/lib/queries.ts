import "server-only";
import { createClient } from "./supabase/server";
import {
  normalizeAgentAnalytics,
  type AgentAnalytics,
} from "./agent-analytics";

/** User-context reads (RLS-scoped). Server components only. */

export async function getAccountContext() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const claims = userData?.claims as
    | {
        sub?: string;
        email?: string;
        user_metadata?: {
          avatar_url?: string;
          full_name?: string;
          name?: string;
          preferred_username?: string;
          user_name?: string;
        };
      }
    | undefined;
  const userId = claims?.sub ?? null;
  const email = claims?.email ?? "";
  const metadata = claims?.user_metadata;
  const avatarUrl = metadata?.avatar_url?.startsWith("https://")
    ? metadata.avatar_url
    : null;
  const displayName =
    metadata?.full_name ??
    metadata?.name ??
    metadata?.preferred_username ??
    metadata?.user_name ??
    email.split("@")[0] ??
    "";
  if (!userId)
    return {
      userId: null,
      email: "",
      displayName: "",
      avatarUrl: null,
    };
  return {
    userId,
    email,
    displayName,
    avatarUrl,
  };
}

export async function getRepositories() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("repositories")
    .select(
      "id, full_name, default_branch, is_private, created_at, github_repo_id",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load repositories: ${error.message}`);
  return data ?? [];
}

export async function getRepository(repoId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("repositories")
    .select(
      "id, org_id, full_name, owner, name, default_branch, github_repo_id, installation_id",
    )
    .eq("id", repoId)
    .maybeSingle();
  if (error) throw new Error(`Could not load repository: ${error.message}`);
  return data;
}

export async function getSiteForRepository(repoId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sites")
    .select("id, site_id, allowed_origins, current_manifest_id, org_id")
    .eq("repository_id", repoId)
    .maybeSingle();
  if (error)
    throw new Error(`Could not load repository site: ${error.message}`);
  return data;
}

export async function getRuns(repoId: string, limit = 10) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("analysis_runs")
    .select(
      "id, status, stage, stage_statuses, error, created_at, finished_at, repository_commits(sha, ref)",
    )
    .eq("repository_id", repoId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load analysis runs: ${error.message}`);
  return data ?? [];
}

export async function getRun(runId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("analysis_runs")
    .select(
      "id, repository_id, org_id, status, stage, stage_statuses, error, created_at, finished_at, repository_commits(sha, ref)",
    )
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(`Could not load analysis run: ${error.message}`);
  return data;
}

export async function getCandidates(runId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("action_candidates")
    .select(
      "id, action_id, name, title, description, risk_level, confirmation, confidence, status, validation_issues, review_note, created_at, contract",
    )
    .eq("run_id", runId)
    .order("confidence", { ascending: false });
  if (error) throw new Error(`Could not load proposed tools: ${error.message}`);
  return data ?? [];
}

/** passed/failed eval counts per candidate for one run. */
export async function getEvalSummaries(
  runId: string,
): Promise<Map<string, { passed: number; failed: number }>> {
  const supabase = await createClient();
  const { data: candidates, error: candidatesError } = await supabase
    .from("action_candidates")
    .select("id")
    .eq("run_id", runId);
  if (candidatesError)
    throw new Error(
      `Could not load candidate evaluations: ${candidatesError.message}`,
    );
  const ids = (candidates ?? []).map((row) => row.id);
  const summaries = new Map<string, { passed: number; failed: number }>();
  if (ids.length === 0) return summaries;
  const { data: evals, error: evalsError } = await supabase
    .from("eval_runs")
    .select("candidate_id, passed")
    .in("candidate_id", ids);
  if (evalsError)
    throw new Error(
      `Could not load candidate evaluations: ${evalsError.message}`,
    );
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
  const { data, error } = await supabase
    .from("action_candidates")
    .select("*, analysis_runs(id, repository_id)")
    .eq("id", candidateId)
    .maybeSingle();
  if (error) throw new Error(`Could not load proposed tool: ${error.message}`);
  return data;
}

export async function getEvalRuns(candidateId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eval_runs")
    .select("name, passed, details, created_at")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false });
  if (error)
    throw new Error(`Could not load tool evaluations: ${error.message}`);
  return data ?? [];
}

/** Everything rendered by the repository's install and availability area. */
export async function getPublication(siteUuid: string) {
  const supabase = await createClient();
  const [contracts, manifests, deployments, prs, usage] = await Promise.all([
    supabase
      .from("tool_contracts")
      .select("id, action_id, name, status, latest_version_id, created_at")
      .eq("site_id", siteUuid)
      .order("name"),
    supabase
      .from("manifests")
      .select("id, version, status, created_at, published_at, manifest")
      .eq("site_id", siteUuid)
      .order("version", { ascending: false })
      .limit(20),
    supabase
      .from("manifest_deployments")
      .select("action, created_at, manifest_id")
      .eq("site_id", siteUuid)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("integration_prs")
      .select(
        "id, status, pr_number, url, branch, error, created_at, updated_at",
      )
      .eq("site_id", siteUuid)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("usage_events")
      .select("event, data, created_at")
      .eq("site_id", siteUuid)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  const failed =
    contracts.error ??
    manifests.error ??
    deployments.error ??
    prs.error ??
    usage.error;
  if (failed)
    throw new Error(`Could not load publication state: ${failed.message}`);
  return {
    contracts: contracts.data ?? [],
    manifests: manifests.data ?? [],
    deployments: deployments.data ?? [],
    prs: prs.data ?? [],
    usage: usage.data ?? [],
  };
}

export async function getToolContracts(siteUuid: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tool_contracts")
    .select("id, action_id, name, status, latest_version_id, created_at")
    .eq("site_id", siteUuid)
    .order("name");
  if (error) throw new Error(`Could not load tool contracts: ${error.message}`);
  return data ?? [];
}

export async function getAgentAnalytics(
  siteUuid: string,
  days: number,
): Promise<AgentAnalytics | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_agent_analytics", {
    p_site_id: siteUuid,
    p_days: days,
  });
  if (error) {
    console.error("Unable to load agent analytics", error.message);
    return null;
  }
  return normalizeAgentAnalytics(data, days);
}

export async function getCompatFindings(repoId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("compat_findings")
    .select("id, commit_sha, finding, severity, status, created_at")
    .eq("repository_id", repoId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error)
    throw new Error(`Could not load compatibility findings: ${error.message}`);
  return data ?? [];
}

export async function getInstallations() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("github_installations")
    .select(
      "id, org_id, installation_id, account_login, account_type, suspended_at, created_at",
    )
    .order("created_at", { ascending: false });
  if (error)
    throw new Error(`Could not load GitHub installations: ${error.message}`);
  return data ?? [];
}
