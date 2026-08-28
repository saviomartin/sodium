interface AnalysisRunSummary {
  status: string;
  repository_commits: unknown;
}

function commitSha(run: AnalysisRunSummary | undefined): string | null {
  const commit = run?.repository_commits as { sha?: unknown } | null;
  return typeof commit?.sha === "string" ? commit.sha : null;
}

/** Emphasize analysis when it has never succeeded or the latest commit is stale. */
export function shouldEmphasizeRunAnalysis(
  runs: AnalysisRunSummary[],
): boolean {
  const latestSuccessfulRun = runs.find((run) => run.status === "succeeded");
  if (!latestSuccessfulRun) return true;

  const latestKnownSha = commitSha(runs[0]);
  const latestSuccessfulSha = commitSha(latestSuccessfulRun);
  return Boolean(
    latestKnownSha &&
      latestSuccessfulSha &&
      latestKnownSha !== latestSuccessfulSha,
  );
}
