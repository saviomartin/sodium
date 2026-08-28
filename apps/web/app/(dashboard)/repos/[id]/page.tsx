import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCandidates,
  getCompatFindings,
  getEnvironments,
  getPublication,
  getRepository,
  getRuns,
  getSiteForRepository,
} from "@/lib/queries";
import { requestAnalysisAction, saveEnvironmentAction } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ReviewTable, type CandidateRow } from "@/components/review-table";
import {
  Card,
  EmptyState,
  Field,
  RunStatusBadge,
  buttonClass,
  inputClass,
  secondaryButtonClass,
} from "@/components/ui";
import type { CompatFinding, RiskLevel, RunStatus } from "@sodium/contracts";

export const metadata = { title: "Repository" };

export default async function RepositoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = await getRepository(id);
  if (!repo) notFound();

  const [environments, runs, site, findings] = await Promise.all([
    getEnvironments(id),
    getRuns(id),
    getSiteForRepository(id),
    getCompatFindings(id),
  ]);
  const activeRun = runs.find(
    (run) => run.status === "queued" || run.status === "running",
  );
  const latestSuccessfulRun = runs.find((run) => run.status === "succeeded");
  const [candidates, publication] = await Promise.all([
    latestSuccessfulRun ? getCandidates(latestSuccessfulRun.id) : [],
    site ? getPublication(site.id) : null,
  ]);
  const activeActionIds = new Set(
    (publication?.contracts ?? [])
      .filter((contract) => contract.status === "active")
      .map((contract) => contract.action_id),
  );
  const rows: CandidateRow[] = candidates.map((candidate) => ({
    id: candidate.id,
    action_id: candidate.action_id,
    name: candidate.name,
    title: candidate.title,
    description: candidate.description,
    risk_level: candidate.risk_level as RiskLevel,
    confidence: Number(candidate.confidence),
    enabled: activeActionIds.has(candidate.action_id),
    repoId: repo.id,
  }));

  const settings = (
    <details
      className="rounded-lg border border-neutral-200 bg-white"
      open={Boolean(site && site.allowed_origins.length === 0)}
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
        App URL &amp; analysis settings
      </summary>
      <div className="border-t border-neutral-100 p-4">
        {environments.length > 0 && (
          <ul className="mb-4 space-y-1 text-sm">
            {environments.map((environment) => (
              <li
                key={environment.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="font-mono text-xs truncate">
                  {environment.base_url}
                </span>
                <span className="text-xs text-neutral-500">
                  {environment.auth_mode}
                  {environment.credential_secret_id
                    ? " · credential stored"
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <ActionForm
          action={saveEnvironmentAction}
          className="space-y-3"
          successMessage="App URL saved."
        >
          <input type="hidden" name="repositoryId" value={repo.id} />
          <Field
            label="App URL"
            hint="Used for optional preview analysis and to scope enabled tools to your app."
          >
            <input
              name="baseUrl"
              type="url"
              required
              className={inputClass}
              placeholder="https://app.example.com"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Preview access">
              <select
                name="authMode"
                className={inputClass}
                defaultValue="none"
              >
                <option value="none">No authentication</option>
                <option value="basic">HTTP basic (user:pass)</option>
                <option value="cookie">Cookie header</option>
              </select>
            </Field>
            <Field
              label="Credential"
              hint="Only needed for authenticated previews. Stored encrypted."
            >
              <input
                name="credential"
                type="password"
                className={inputClass}
                autoComplete="off"
              />
            </Field>
          </div>
          <SubmitButton className={secondaryButtonClass} pendingText="Saving…">
            Save app URL
          </SubmitButton>
        </ActionForm>
      </div>
    </details>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-balance">
            {repo.full_name}
          </h1>
          <p className="text-sm text-neutral-500">
            Default branch <span className="font-mono">{repo.default_branch}</span>
          </p>
        </div>
        {activeRun ? (
          <Link
            href={`/repos/${repo.id}/runs/${activeRun.id}`}
            className={secondaryButtonClass}
          >
            View analysis
          </Link>
        ) : (
          <ActionForm action={requestAnalysisAction}>
            <input type="hidden" name="repositoryId" value={repo.id} />
            <input
              type="hidden"
              name="environmentId"
              value={environments[0]?.id ?? ""}
            />
            <SubmitButton className={buttonClass} pendingText="Starting…">
              Analyze latest commit
            </SubmitButton>
          </ActionForm>
        )}
      </header>

      {site && site.allowed_origins.length === 0 && settings}

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
            title={latestSuccessfulRun ? "No tools proposed" : "No analysis yet"}
            hint={
              latestSuccessfulRun
                ? "The analyzer found no useful actions in the latest successful run."
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

      {site && site.allowed_origins.length > 0 && settings}

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
  );
}
