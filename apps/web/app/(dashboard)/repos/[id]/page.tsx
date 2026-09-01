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
import {
  requestAnalysisAction,
  updateRepositoryProjectRootAction,
} from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { RepositoryIntegration } from "@/components/repository-integration";
import { AgentAnalyticsDashboard } from "@/components/agent-analytics-dashboard";
import { RepositorySettingsState } from "@/components/repository-settings-state";
import { RepositoryLiveRefresh } from "@/components/repository-live-refresh";
import { RepositoryFullName } from "@/components/repository-row";
import { ReviewTable, type CandidateRow } from "@/components/review-table";
import {
  CheckoutStatusNotice,
  PaywalledButton,
  RepositoryBillingControl,
  RepositoryPaywall,
} from "@/components/repository-paywall";
import { hasPaidRepositoryAccess } from "@/lib/billing-state";
import {
  Card,
  CtaArrow,
  CtaRepeat,
  EmptyState,
  RunStatusBadge,
  buttonClass,
  frameClass,
  inputClass,
  secondaryButtonClass,
} from "@/components/ui";
import {
  ArrowRightIcon,
  ClockCounterClockwiseIcon,
  CubeIcon,
  GitBranchIcon,
  GitCommitIcon,
  GithubMarkIcon,
  InfoIcon,
  MagnifyingGlassIcon,
  PathIcon,
  WarningIcon,
  WarningCircleIcon,
  WrenchIcon,
} from "@/components/icons";
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
        framework?: string;
        projectRoot?: string;
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
  // Run analysis is the single primary action. Before payment it opens the
  // repository checkout; after payment it starts a new run immediately.
  const analyzedBefore = Boolean(latestSuccessfulRun);
  const RunAnalysisMark = analyzedBefore ? CtaRepeat : CtaArrow;

  return (
    <RepositorySettingsState>
      <RepositoryPaywall
        repositoryId={repo.id}
        repositoryName={repo.full_name}
        paid={paid}
        checkoutState={checkoutState}
      >
        <div className="space-y-6">
          <RepositoryLiveRefresh active={Boolean(activeRun)} />
          <CheckoutStatusNotice state={checkoutState} paid={paid} />
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-lg font-medium text-balance">
                <GithubMarkIcon
                  aria-hidden
                  className="size-5 shrink-0 text-faint"
                />
                <RepositoryFullName fullName={repo.full_name} />
              </h1>
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-neutral-400">
                <span className="inline-flex items-center gap-1">
                  <GitBranchIcon aria-hidden className="size-4 shrink-0" />
                  <span className="font-mono">{repo.default_branch}</span>
                </span>
                <span aria-hidden className="text-white/20">
                  ·
                </span>
                {paid
                  ? "New commits are analyzed automatically"
                  : "Subscribe to analyze this repository"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activeRun ? (
                <Link
                  href={`/repos/${repo.id}/runs/${activeRun.id}`}
                  className={secondaryButtonClass}
                >
                  View analysis
                  <CtaArrow />
                </Link>
              ) : paid ? (
                <ActionForm
                  action={requestAnalysisAction}
                  submitEvent={{
                    name: "Analysis Requested",
                    properties: { source: "manual" },
                  }}
                >
                  <input type="hidden" name="repositoryId" value={repo.id} />
                  <SubmitButton className={buttonClass} pendingText="Starting…">
                    Run analysis
                    <RunAnalysisMark />
                  </SubmitButton>
                </ActionForm>
              ) : (
                <PaywalledButton action="run analysis" className={buttonClass}>
                  Run analysis
                  <RunAnalysisMark />
                </PaywalledButton>
              )}
              {paid ? (
                <RepositoryBillingControl
                  repositoryId={repo.id}
                  status={billing?.status ?? null}
                  cancelAtPeriodEnd={billing?.cancel_at_period_end ?? false}
                  currentPeriodEnd={billing?.current_period_end ?? null}
                />
              ) : null}
            </div>
          </header>

          <details className={frameClass}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
              <span className="inline-flex items-center gap-2 font-medium text-neutral-200">
                <PathIcon aria-hidden className="size-4 text-faint" />
                Application root
              </span>
              <span className="font-mono text-xs text-neutral-400">
                {repo.project_root ?? "Auto-detect"}
              </span>
            </summary>
            <div className="border-t border-white/10 px-4 py-4">
              <ActionForm
                action={updateRepositoryProjectRootAction}
                className="max-w-xl"
                successMessage="Application root saved"
              >
                <input type="hidden" name="repositoryId" value={repo.id} />
                <fieldset disabled={Boolean(activeRun)}>
                  <label
                    htmlFor="project-root"
                    className="mb-1.5 block text-sm font-medium text-neutral-200"
                  >
                    Repository-relative directory
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id="project-root"
                      name="projectRoot"
                      defaultValue={repo.project_root ?? ""}
                      placeholder="apps/web"
                      autoComplete="off"
                      spellCheck={false}
                      className={inputClass}
                    />
                    <SubmitButton
                      className={secondaryButtonClass}
                      pendingText="Checking…"
                    >
                      Save
                    </SubmitButton>
                  </div>
                </fieldset>
                <p className="mt-2 text-xs text-faint text-pretty">
                  {activeRun
                    ? "This setting is locked until the active analysis finishes."
                    : "Leave blank to auto-detect one app. Use . for the repository root, or a path such as apps/web for a monorepo app."}
                </p>
                {staticDetail?.framework ? (
                  <p className="mt-1 text-xs text-neutral-400 text-pretty">
                    Last successful analysis: {staticDetail.framework}
                    {staticDetail.projectRoot
                      ? ` at ${staticDetail.projectRoot}`
                      : " at repository root"}
                  </p>
                ) : null}
              </ActionForm>
            </div>
          </details>

          <Card
            title="Proposed tools"
            icon={WrenchIcon}
            actions={
              latestSuccessfulRun ? (
                <span className="inline-flex items-center gap-1 font-mono text-xs text-faint">
                  <GitCommitIcon aria-hidden className="size-3.5" />
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
                icon={WarningCircleIcon}
                title="Repository setup is incomplete"
                hint="Reconnect this repository to restore its tool settings."
              />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={latestSuccessfulRun ? CubeIcon : MagnifyingGlassIcon}
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
              />
            )}
          </Card>

          {site && publication ? (
            <RepositoryIntegration
              site={site}
              publication={publication}
              locked={!paid}
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
            />
          ) : null}

          {findings.length > 0 && (
            <Card title="Needs attention" icon={WarningIcon}>
              <ul className="space-y-2">
                {findings.map((row) => {
                  const finding = row.finding as unknown as CompatFinding;
                  const SeverityIcon =
                    row.severity === "breaking"
                      ? WarningIcon
                      : row.severity === "warning"
                        ? WarningCircleIcon
                        : InfoIcon;
                  return (
                    <li key={row.id} className="flex items-start gap-2 text-sm">
                      <span
                        className={`mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${
                          row.severity === "breaking"
                            ? "bg-red-500/15 text-red-400"
                            : row.severity === "warning"
                              ? "bg-amber-500/15 text-amber-300"
                              : "bg-white/[0.06] text-neutral-400"
                        }`}
                      >
                        <SeverityIcon
                          aria-hidden
                          weight="fill"
                          className="size-3.5 shrink-0"
                        />
                        {row.severity}
                      </span>
                      <div>
                        <p className="text-pretty">
                          <span className="font-mono text-xs">
                            {finding.toolName}
                          </span>
                          : {finding.summary}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-faint tabular-nums">
                          <GitCommitIcon aria-hidden className="size-3.5" />
                          {row.commit_sha.slice(0, 10)} ·{" "}
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
            <details className={frameClass}>
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
                <ClockCounterClockwiseIcon
                  aria-hidden
                  className="size-4 text-faint"
                />
                Analysis history
              </summary>
              <div className="overflow-x-auto border-t border-white/[0.07] px-4 pb-4">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs text-neutral-400">
                      <th className="py-2 pr-4 font-medium">Commit</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Started</th>
                      <th className="py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.07]">
                    {runs.map((run) => {
                      const commit = run.repository_commits as unknown as {
                        sha: string;
                      } | null;
                      return (
                        <tr key={run.id}>
                          <td className="py-2 pr-4 font-mono text-xs">
                            <span className="inline-flex items-center gap-1.5">
                              <GitCommitIcon
                                aria-hidden
                                className="size-3.5 text-faint"
                              />
                              {commit?.sha.slice(0, 10)}
                            </span>
                          </td>
                          <td className="py-2 pr-4">
                            <RunStatusBadge status={run.status as RunStatus} />
                          </td>
                          <td className="py-2 pr-4 text-xs text-neutral-400 tabular-nums">
                            {new Date(run.created_at).toLocaleString()}
                          </td>
                          <td className="py-2 text-right">
                            {run.status !== "succeeded" && (
                              <Link
                                href={`/repos/${repo.id}/runs/${run.id}`}
                                className="group inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:underline"
                              >
                                Open
                                <ArrowRightIcon
                                  aria-hidden
                                  weight="bold"
                                  className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
                                />
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
      </RepositoryPaywall>
    </RepositorySettingsState>
  );
}
