import "server-only";

import { env, siteUrl } from "./env";
import { resolveRepositoryHead } from "./github";
import { createServiceClient } from "./supabase/service";

/**
 * Starts the latest repository analysis after Stripe grants paid access.
 * The database function is idempotent for a queued, running, or successful
 * run of the same commit, so webhook retries cannot create duplicate work.
 */
export async function ensurePaidRepositoryAnalysis(repositoryId: string) {
  const service = createServiceClient();
  const { data: repository, error: repositoryError } = await service
    .from("repositories")
    .select("id, owner, name, default_branch, github_connection_id")
    .eq("id", repositoryId)
    .maybeSingle();
  if (repositoryError) throw new Error(repositoryError.message);
  if (!repository) throw new Error("repository not found");
  if (!repository.github_connection_id) {
    throw new Error("GitHub connection is unavailable");
  }

  const sha = await resolveRepositoryHead(
    repository.github_connection_id,
    repository.owner,
    repository.name,
    repository.default_branch,
  );
  const { data: runId, error } = await service.rpc("request_paid_analysis", {
    p_repository_id: repository.id,
    p_commit_sha: sha,
    p_ref: repository.default_branch,
  });
  if (error) throw new Error(error.message);
  return runId as string;
}

/** Best-effort immediate worker start; the one-minute cron remains recovery. */
export async function kickAnalysisWorker() {
  const workerSecret = env.CRON_SECRET ?? env.GITHUB_WEBHOOK_SECRET;
  if (!workerSecret) return;
  const response = await fetch(`${siteUrl()}/api/internal/worker`, {
    method: "POST",
    headers: { authorization: `Bearer ${workerSecret}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`worker kick failed with status ${response.status}`);
  }
}
