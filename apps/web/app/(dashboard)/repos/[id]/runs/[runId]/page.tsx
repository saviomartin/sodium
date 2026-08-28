import Link from "next/link";
import { notFound } from "next/navigation";
import type {
  ActionContract,
  CandidateStatus,
  JobError,
  RiskLevel,
  RunStatus,
} from "@sodium/contracts";
import {
  getCandidates,
  getEvalSummaries,
  getRepository,
  getRun,
} from "@/lib/queries";
import {
  Card,
  EmptyState,
  RunStatusBadge,
  secondaryButtonClass,
} from "@/components/ui";
import { RunProgress } from "@/components/run-progress";
import { ReviewTable, type CandidateRow } from "@/components/review-table";

export const metadata = { title: "Analysis run" };

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const [repo, run] = await Promise.all([getRepository(id), getRun(runId)]);
  if (!repo || !run || run.repository_id !== repo.id) notFound();

  const [candidates, evalSummaries] = await Promise.all([
    getCandidates(runId),
    getEvalSummaries(runId),
  ]);
  const commit = run.repository_commits as unknown as { sha: string } | null;
  const error = run.error as unknown as JobError | null;

  const rows: CandidateRow[] = candidates.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    title: candidate.title,
    description: candidate.description,
    risk_level: candidate.risk_level as RiskLevel,
    confirmation: candidate.confirmation,
    confidence: Number(candidate.confidence),
    status: candidate.status as CandidateStatus,
    validation_issues: candidate.validation_issues,
    handlerKind:
      (candidate.contract as unknown as ActionContract | null)?.handler.kind ??
      "?",
    evalSummary: evalSummaries.get(candidate.id) ?? { passed: 0, failed: 0 },
    repoId: repo.id,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-neutral-400">
            <Link href={`/repos/${repo.id}`} className="hover:underline">
              {repo.full_name}
            </Link>{" "}
            / analysis
          </p>
          <h1 className="text-lg font-semibold">
            Commit <span className="font-mono">{commit?.sha.slice(0, 10)}</span>{" "}
            <RunStatusBadge status={run.status as RunStatus} />
          </h1>
        </div>
        <Link
          href={`/repos/${repo.id}/publish`}
          className={secondaryButtonClass}
        >
          Publish &amp; loader
        </Link>
      </header>

      <Card title="Pipeline">
        <RunProgress
          runId={run.id}
          runStatus={run.status}
          initialStageStatuses={
            (run.stage_statuses ?? {}) as Record<
              string,
              { status?: string; message?: string }
            >
          }
        />
        {error && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 text-pretty"
          >
            {error.code}: {error.message}
          </p>
        )}
      </Card>

      <Card title="Proposed tools">
        {rows.length === 0 ? (
          <EmptyState
            title={
              run.status === "succeeded"
                ? "No tools proposed"
                : "Waiting for synthesis"
            }
            hint={
              run.status === "succeeded"
                ? "The analyzer found no groupable actions in this commit."
                : "Candidates appear here after the synthesis and validation stages complete."
            }
          />
        ) : (
          <ReviewTable candidates={rows} />
        )}
      </Card>
    </div>
  );
}
