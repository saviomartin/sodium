import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAgentAnalytics,
  getCandidates,
  getCompatFindings,
  getEvalRunsForCandidates,
  getPublication,
  getRepository,
  getRepositoryBilling,
  getRuns,
  getSiteForRepository,
} from "@/lib/queries";
import { emptyAgentAnalytics } from "@/lib/agent-analytics";
import { requestAnalysisAction } from "@/lib/actions";
import { shouldEmphasizeRunAnalysis } from "@/lib/analysis-state";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { RepositoryIntegration } from "@/components/repository-integration";
import { AgentAnalyticsDashboard } from "@/components/agent-analytics-dashboard";
import { RepositorySettingsState } from "@/components/repository-settings-state";
import { RepositoryLiveRefresh } from "@/components/repository-live-refresh";
import { ReviewTable, type CandidateRow } from "@/components/review-table";
import {
  CheckoutStatusNotice,
  RepositoryBillingControl,
} from "@/components/repository-paywall";
import { hasPaidRepositoryAccess } from "@/lib/billing-state";
import {
  Card,
  EmptyState,
  RunStatusBadge,
  buttonClass,
  secondaryButtonClass,
} from "@/components/ui";
import {
  ActionContractSchema,
  type CompatFinding,
  type ConfirmationPolicy,
  type ContractIssue,
  type RiskLevel,
  type RunStatus,
} from "@sodium/contracts";

export const metadata = { title: "Repository" };

const VALID_ANALYTICS_RANGES = new Set([7, 30, 90]);

export default async function RepositoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    range?: string | string[];
    checkout?: string | string[];
  }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const requestedRange = Array.isArray(query.range)
    ? query.range[0]
    : query.range;
  const parsedRange = Number.parseInt(
    requestedRange?.replace(/d$/, "") ?? "30",
    10,
  );
  const analyticsDays = VALID_ANALYTICS_RANGES.has(parsedRange)
    ? parsedRange
    : 30;
  const repo = await getRepository(id);
  if (!repo) notFound();
  const checkoutState = Array.isArray(query.checkout)
    ? query.checkout[0]
    : query.checkout;

  const [runs, site, findings, billing] = await Promise.all([
    getRuns(id),
    getSiteForRepository(id),
    getCompatFindings(id),
    getRepositoryBilling(id),
  ]);
  const paid = hasPaidRepositoryAccess(billing?.status);
  const activeRun = runs.find(
    (run) => run.status === "queued" || run.status === "running",
  );
  const latestSuccessfulRun = runs.find((run) => run.status === "succeeded");
  const stageStatuses = latestSuccessfulRun?.stage_statuses as
    Record<string, unknown> | null | undefined;
  const synthesizeDetail = stageStatuses?.synthesize as
    { proposed?: number; potential?: number } | undefined;
  const staticDetail = stageStatuses?.static as
    | {
        routes?: number;
        links?: number;
        forms?: number;
        serverActions?: number;
        routeHandlers?: number;
      }
    | undefined;
  const [candidates, publication, analytics] = await Promise.all([
    latestSuccessfulRun ? getCandidates(latestSuccessfulRun.id) : [],
    site ? getPublication(site.id) : null,
    site ? getAgentAnalytics(site.id, analyticsDays) : null,
  ]);
  const candidateEvals = await getEvalRunsForCandidates(
    candidates.map((candidate) => candidate.id),
  );
  const activeActionIds = new Set(
    (publication?.contracts ?? [])
      .filter((contract) => contract.status === "active")
      .map((contract) => contract.action_id),
  );
  const rows: CandidateRow[] = candidates.flatMap((candidate) => {
    const parsedContract = ActionContractSchema.safeParse(candidate.contract);
    if (!parsedContract.success) return [];
    const contract = parsedContract.data;

    return [
      {
        id: candidate.id,
        action_id: candidate.action_id,
        name: candidate.name,
        title: candidate.title,
        description: candidate.description,
        risk_level: candidate.risk_level as RiskLevel,
        confidence: Number(candidate.confidence),
        status: candidate.status,
        scopePaths: contract.routes.map((route) => route.pathPattern),
        detail: {
          actionId: candidate.action_id,
          name: candidate.name,
          title: candidate.title,
          description: candidate.description,
          riskLevel: candidate.risk_level as RiskLevel,
          confirmation: candidate.confirmation as ConfirmationPolicy,
          confidence: Number(candidate.confidence),
          contract,
          issues: (candidate.validation_issues ??
            []) as unknown as ContractIssue[],
          evals: candidateEvals.get(candidate.id) ?? [],
        },
        enabled: activeActionIds.has(candidate.action_id),
      },
    ];
  });
  const discoveredPrimitiveCount =
    (staticDetail?.routes ?? 0) +
    (staticDetail?.links ?? 0) +
    (staticDetail?.forms ?? 0) +
    (staticDetail?.serverActions ?? 0) +
    (staticDetail?.routeHandlers ?? 0);
  const legacyEmptyAnalysis =
    Boolean(latestSuccessfulRun) &&
    rows.length === 0 &&
    discoveredPrimitiveCount > 0 &&
    (synthesizeDetail?.potential === undefined || candidates.length > 0);
  const emphasizeRunAnalysis =
    shouldEmphasizeRunAnalysis(runs) || legacyEmptyAnalysis;

  return (
    <RepositorySettingsState>
      <div className="space-y-6">
        <RepositoryLiveRefresh active={Boolean(activeRun)} />
        <CheckoutStatusNotice state={checkoutState} paid={paid} />
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-balance">
              {repo.full_name}
            </h1>
            <p className="text-sm text-neutral-500">
              Default branch{" "}
              <span className="font-mono">{repo.default_branch}</span>
              {" · "}
              {paid
                ? "New commits are analyzed automatically"
                : repo.free_analysis_consumed_at
                  ? "Generated tools are ready to review"
                  : "Your first successful analysis is included"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeRun ? (
              <Link
                href={`/repos/${repo.id}/runs/${activeRun.id}`}
                className={secondaryButtonClass}
              >
                View analysis
              </Link>
            ) : paid || !repo.free_analysis_consumed_at ? (
              <ActionForm
                action={requestAnalysisAction}
                submitEvent={{
                  name: "Analysis Requested",
                  properties: { source: "manual" },
                }}
              >
                <input type="hidden" name="repositoryId" value={repo.id} />
                <SubmitButton
                  className={
                    emphasizeRunAnalysis ? buttonClass : secondaryButtonClass
                  }
                  pendingText="Starting…"
                >
                  Run analysis now
                </SubmitButton>
              </ActionForm>
            ) : (
              <button
                type="button"
                className={secondaryButtonClass}
                disabled
                title="Subscribe to run another analysis"
              >
                Run analysis now
              </button>
            )}
            {site ? (
              <RepositoryBillingControl
                repositoryId={repo.id}
                repositoryName={repo.full_name}
                paid={paid}
                status={billing?.status ?? null}
                cancelAtPeriodEnd={billing?.cancel_at_period_end ?? false}
                currentPeriodEnd={billing?.current_period_end ?? null}
                checkoutState={checkoutState}
              />
            ) : null}
          </div>
        </header>

        <Card
          title="Proposed tools"
          actions={
            latestSuccessfulRun ? (
              <span className="font-mono text-xs text-neutral-400">
                {(
                  latestSuccessfulRun.repository_commits as unknown as {
                    sha: string;
                  } | null
                )?.sha.slice(0, 10)}
              </span>
            ) : undefined
          }
        >
          {!site ? (
            <EmptyState
              title="Repository setup is incomplete"
              hint="Reconnect this repository to restore its tool settings."
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title={
                latestSuccessfulRun
                  ? legacyEmptyAnalysis
                    ? "Reanalysis required"
                    : "No executable tools found"
                  : "No analysis yet"
              }
              hint={
                latestSuccessfulRun
                  ? legacyEmptyAnalysis
                    ? `The previous analyzer found ${discoveredPrimitiveCount} code primitives but discarded every tool. Run analysis again with the repaired pipeline.`
                    : "The repository has no source-grounded page, link, form, or browser-control capability that can be exposed safely."
                  : "Analyze the latest commit to discover tools."
              }
            />
          ) : (
            <ReviewTable
              key={`${latestSuccessfulRun?.id}:${rows.map((row) => `${row.id}:${row.enabled}`).join(",")}`}
              candidates={rows}
              siteId={site.id}
              locked={!paid}
            />
          )}
        </Card>

        {site && publication ? (
          <RepositoryIntegration
            site={site}
            publication={publication}
            locked={!paid}
            unlockAction={
              !paid ? (
                <RepositoryBillingControl
                  repositoryId={repo.id}
                  repositoryName={repo.full_name}
                  paid={false}
                  status={billing?.status ?? null}
                  cancelAtPeriodEnd={false}
                  currentPeriodEnd={null}
                  checkoutState={checkoutState}
                  label="Unlock install & access"
                />
              ) : undefined
            }
          />
        ) : null}

        {site ? (
          <AgentAnalyticsDashboard
            repoId={repo.id}
            managedTools={(publication?.contracts ?? [])
              .filter((contract) => contract.status === "active")
              .map((contract) => contract.name)}
            analytics={analytics ?? emptyAgentAnalytics(analyticsDays)}
            locked={!paid}
            unlockAction={
              !paid ? (
                <RepositoryBillingControl
                  repositoryId={repo.id}
                  repositoryName={repo.full_name}
                  paid={false}
                  status={billing?.status ?? null}
                  cancelAtPeriodEnd={false}
                  currentPeriodEnd={null}
                  checkoutState={checkoutState}
                  label="Unlock analytics"
                />
              ) : undefined
            }
          />
        ) : null}

        {findings.length > 0 && (
          <Card title="Needs attention">
            <ul className="space-y-2">
              {findings.map((row) => {
                const finding = row.finding as unknown as CompatFinding;
                return (
                  <li key={row.id} className="flex items-start gap-2 text-sm">
                    <span
                      className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${
                        row.severity === "breaking"
                          ? "bg-red-50 text-red-700"
                          : row.severity === "warning"
                            ? "bg-amber-50 text-amber-800"
                            : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {row.severity}
                    </span>
                    <div>
                      <p className="text-pretty">
                        <span className="font-mono text-xs">
                          {finding.toolName}
                        </span>{" "}
                        — {finding.summary}
                      </p>
                      <p className="text-xs text-neutral-400 tabular-nums">
                        commit {row.commit_sha.slice(0, 10)} ·{" "}
                        {new Date(row.created_at).toLocaleString()}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {runs.length > 0 && (
          <details className="rounded-lg border border-neutral-200 bg-white">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
              Analysis history
            </summary>
            <div className="overflow-x-auto border-t border-neutral-100 px-4 pb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                    <th className="py-2 pr-4 font-medium">Commit</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Started</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {runs.map((run) => {
                    const commit = run.repository_commits as unknown as {
                      sha: string;
                    } | null;
                    return (
                      <tr key={run.id}>
                        <td className="py-2 pr-4 font-mono text-xs">
                          {commit?.sha.slice(0, 10)}
                        </td>
                        <td className="py-2 pr-4">
                          <RunStatusBadge status={run.status as RunStatus} />
                        </td>
                        <td className="py-2 pr-4 text-xs text-neutral-500 tabular-nums">
                          {new Date(run.created_at).toLocaleString()}
                        </td>
                        <td className="py-2 text-right">
                          {run.status !== "succeeded" && (
                            <Link
                              href={`/repos/${repo.id}/runs/${run.id}`}
                              className="text-xs font-medium text-blue-700 hover:underline"
                            >
                              Open →
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </RepositorySettingsState>
  );
}
