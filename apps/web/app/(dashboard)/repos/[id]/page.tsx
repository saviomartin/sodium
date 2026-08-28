import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCompatFindings,
  getEnvironments,
  getPublication,
  getRepository,
  getRuns,
  getSiteForRepository,
} from "@/lib/queries";
import { requestAnalysisAction, saveEnvironmentAction } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import {
  Card,
  EmptyState,
  Field,
  RunStatusBadge,
  buttonClass,
  inputClass,
  secondaryButtonClass,
} from "@/components/ui";
import type { CompatFinding, RunStatus } from "@sodium/contracts";

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
  const publication = site ? await getPublication(site.id) : null;
  const approvedCount =
    publication?.contracts.filter((contract) => contract.status === "active")
      .length ?? 0;
  const isFixture = repo.github_repo_id === 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-balance">
            {repo.full_name}
          </h1>
          <p className="text-sm text-neutral-500">
            {isFixture ? "Local fixture repository" : "GitHub repository"} ·
            default branch{" "}
            <span className="font-mono">{repo.default_branch}</span>
          </p>
        </div>
        <Link
          href={`/repos/${repo.id}/publish`}
          className={secondaryButtonClass}
        >
          Publish &amp; loader
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Run analysis">
          <p className="mb-3 text-sm text-neutral-600 text-pretty">
            Clones the commit into an isolated workspace (never executing
            repository code), extracts routes, forms, Server Actions and
            schemas, optionally explores the preview, and proposes tools for
            review.
          </p>
          <ActionForm action={requestAnalysisAction} className="space-y-3">
            <input type="hidden" name="repositoryId" value={repo.id} />
            <Field
              label="Commit SHA"
              hint={
                isFixture
                  ? "Leave blank for the fixture snapshot."
                  : "Full 40-character SHA on the default branch."
              }
            >
              <input
                name="sha"
                className={inputClass}
                placeholder={isFixture ? "(fixture)" : "e.g. 4f2a…"}
              />
            </Field>
            {environments.length > 0 && (
              <Field label="Preview environment (optional crawl)">
                <select
                  name="environmentId"
                  className={inputClass}
                  defaultValue={environments[0]!.id}
                >
                  <option value="">Skip preview exploration</option>
                  {environments.map((environment) => (
                    <option key={environment.id} value={environment.id}>
                      {environment.base_url} ({environment.auth_mode})
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <SubmitButton className={buttonClass} pendingText="Queueing…">
              Analyze repository
            </SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Preview environment">
          {environments.length > 0 && (
            <ul className="mb-3 space-y-1 text-sm">
              {environments.map((environment) => (
                <li
                  key={environment.id}
                  className="flex items-center justify-between gap-2"
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
            successMessage="Environment saved."
          >
            <input type="hidden" name="repositoryId" value={repo.id} />
            <Field
              label="Preview URL"
              hint="A deployed preview Sodium may crawl. Nothing is built or executed by Sodium."
            >
              <input
                name="baseUrl"
                type="url"
                required
                className={inputClass}
                placeholder="https://preview.example.com"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Auth mode">
                <select
                  name="authMode"
                  className={inputClass}
                  defaultValue="none"
                >
                  <option value="none">None</option>
                  <option value="basic">HTTP basic (user:pass)</option>
                  <option value="cookie">Cookie header</option>
                </select>
              </Field>
              <Field
                label="Credential"
                hint="Stored encrypted (Vault); never shown again."
              >
                <input
                  name="credential"
                  type="password"
                  className={inputClass}
                  autoComplete="off"
                />
              </Field>
            </div>
            <SubmitButton className={secondaryButtonClass}>
              Save environment
            </SubmitButton>
          </ActionForm>
        </Card>
      </div>

      <Card
        title="Analysis runs"
        actions={
          approvedCount > 0 ? (
            <span className="text-xs text-neutral-500 tabular-nums">
              {approvedCount} approved tools
            </span>
          ) : undefined
        }
      >
        {runs.length === 0 ? (
          <EmptyState
            title="No analyses yet"
            hint="Run the first analysis to discover candidate tools."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                  <th className="py-2 pr-4 font-medium">Commit</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Stage</th>
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
                      <td className="py-2 pr-4 text-xs">{run.stage}</td>
                      <td className="py-2 pr-4 text-xs text-neutral-500 tabular-nums">
                        {new Date(run.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 text-right">
                        <Link
                          href={`/repos/${repo.id}/runs/${run.id}`}
                          className="text-xs font-medium text-blue-700 hover:underline"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Compatibility findings (continuous sync)">
        {findings.length === 0 ? (
          <p className="text-sm text-neutral-500 text-pretty">
            No open findings. Verified push webhooks re-analyze changed code and
            report drift against published tools here; production manifests are
            never changed automatically.
          </p>
        ) : (
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
        )}
      </Card>
    </div>
  );
}
