import Link from "next/link";
import { notFound } from "next/navigation";
import type {
  ActionContract,
  ContractIssue,
  RiskLevel,
} from "@sodium/contracts";
import { ActionContractSchema } from "@sodium/contracts";
import {
  getCandidate,
  getEvalRuns,
  getRepository,
  getSiteForRepository,
  getToolContracts,
} from "@/lib/queries";
import { Card, ConfidenceMeter, RiskBadge } from "@/components/ui";

export const metadata = { title: "Tool detail" };

export default async function CandidatePage({
  params,
}: {
  params: Promise<{ id: string; candidateId: string }>;
}) {
  const { id, candidateId } = await params;
  const [repo, candidate, evals, site] = await Promise.all([
    getRepository(id),
    getCandidate(candidateId),
    getEvalRuns(candidateId),
    getSiteForRepository(id),
  ]);
  const candidateRun = candidate?.analysis_runs as unknown as {
    id: string;
    repository_id: string;
  } | null;
  if (!repo || !candidate || candidateRun?.repository_id !== repo.id) notFound();

  const contracts = site ? await getToolContracts(site.id) : [];
  const available = contracts.some(
    (contract) =>
      contract.action_id === candidate.action_id && contract.status === "active",
  );
  const parsedContract = ActionContractSchema.safeParse(candidate.contract);
  const contract: ActionContract | null = parsedContract.success
    ? parsedContract.data
    : null;
  const issues = (candidate.validation_issues ??
    []) as unknown as ContractIssue[];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs text-neutral-400">
          <Link href={`/repos/${repo.id}`} className="hover:underline">
            {repo.full_name}
          </Link>{" "}
          / tool details
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-balance">
            {candidate.title}
          </h1>
          <span
            className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${
              available
                ? "bg-green-50 text-green-700"
                : "bg-neutral-100 text-neutral-600"
            }`}
          >
            {available ? "available" : "disabled"}
          </span>
          <RiskBadge risk={candidate.risk_level as RiskLevel} />
        </div>
        <p className="mt-1 font-mono text-xs text-neutral-500">
          {candidate.name} · {candidate.action_id}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title="What it does">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-neutral-500">
                  Description
                </dt>
                <dd className="text-pretty">{candidate.description}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-neutral-500">
                  Confirmation
                </dt>
                <dd>{candidate.confirmation}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-neutral-500">
                  Confidence
                </dt>
                <dd>
                  <ConfidenceMeter value={Number(candidate.confidence)} />
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Input & output">
            <pre className="overflow-x-auto rounded bg-neutral-50 p-3 text-xs">
              {JSON.stringify(contract?.inputSchema ?? {}, null, 2)}
            </pre>
            {contract?.output.description && (
              <p className="mt-2 text-xs text-neutral-500 text-pretty">
                Output: {contract.output.description}
              </p>
            )}
          </Card>

          <Card title="Handler & authorization">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-neutral-500">
                  Handler
                </dt>
                <dd>
                  <pre className="mt-1 overflow-x-auto rounded bg-neutral-50 p-3 text-xs">
                    {JSON.stringify(contract?.handler ?? {}, null, 2)}
                  </pre>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-neutral-500">
                  Available on
                </dt>
                <dd className="font-mono text-xs">
                  {contract?.routes
                    .map(
                      (route) =>
                        route.pathPattern +
                        (route.requiresSelector
                          ? ` (requires ${route.requiresSelector})`
                          : ""),
                    )
                    .join(", ")}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-neutral-500">
                  Authentication
                </dt>
                <dd className="text-pretty">
                  {contract?.auth.required
                    ? `Required${contract.auth.roles.length ? ` — roles: ${contract.auth.roles.join(", ")}` : ""}. Your application still enforces access.`
                    : "No authentication requirement detected."}
                </dd>
              </div>
            </dl>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Validation & evaluations">
            {issues.length === 0 && evals.length === 0 ? (
              <p className="text-sm text-neutral-500">
                All deterministic checks passed.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {issues.map((issue, index) => (
                  <li key={`issue-${index}`} className="flex gap-2">
                    <span
                      className={
                        issue.severity === "error"
                          ? "text-red-700"
                          : "text-amber-700"
                      }
                    >
                      {issue.severity}
                    </span>
                    <span className="text-pretty">
                      <span className="font-mono text-xs">{issue.code}</span> —{" "}
                      {issue.message}
                    </span>
                  </li>
                ))}
                {evals.map((evalRun, index) => (
                  <li key={`eval-${index}`} className="flex gap-2">
                    <span
                      className={
                        evalRun.passed ? "text-green-700" : "text-amber-700"
                      }
                    >
                      {evalRun.passed ? "pass" : "fail"}
                    </span>
                    <span className="text-pretty">
                      <span className="font-mono text-xs">{evalRun.name}</span>{" "}
                      —{" "}
                      {
                        (evalRun.details as { details?: string } | null)
                          ?.details
                      }
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Source evidence">
            {!contract || contract.evidence.length === 0 ? (
              <p className="text-sm text-neutral-500">No evidence attached.</p>
            ) : (
              <ul className="space-y-3">
                {contract.evidence.map((evidence, index) => (
                  <li key={index} className="text-sm">
                    {evidence.kind === "source" ? (
                      <details>
                        <summary className="cursor-pointer">
                          <span className="font-mono text-xs">
                            {evidence.filePath}:{evidence.startLine}–
                            {evidence.endLine}
                          </span>{" "}
                          <span className="text-neutral-500">
                            ({evidence.primitive.replace("_", " ")})
                          </span>
                        </summary>
                        <pre className="mt-2 max-h-64 overflow-auto rounded bg-neutral-50 p-3 text-xs">
                          {evidence.excerpt}
                        </pre>
                      </details>
                    ) : evidence.kind === "crawl" ? (
                      <p className="text-pretty">
                        <span className="font-medium">Preview crawl</span> —{" "}
                        {evidence.summary}{" "}
                        <span className="font-mono text-xs">
                          {evidence.url}
                        </span>
                      </p>
                    ) : (
                      <p className="text-pretty">
                        <span className="font-medium">Eval</span>{" "}
                        {evidence.evalName}: {evidence.details}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
