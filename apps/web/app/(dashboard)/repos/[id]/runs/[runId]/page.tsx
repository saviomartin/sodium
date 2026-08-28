import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { JobError, RunStatus } from "@sodium/contracts";
import { getRepository, getRun } from "@/lib/queries";
import { Card, RunStatusBadge } from "@/components/ui";
import { RunProgress } from "@/components/run-progress";

export const metadata = { title: "Analysis" };

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const [repo, run] = await Promise.all([getRepository(id), getRun(runId)]);
  if (!repo || !run || run.repository_id !== repo.id) notFound();
  if (run.status === "succeeded") redirect(`/repos/${repo.id}`);

  const commit = run.repository_commits as unknown as { sha: string } | null;
  const error = run.error as unknown as JobError | null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="text-xs text-neutral-400">
          <Link href={`/repos/${repo.id}`} className="hover:underline">
            {repo.full_name}
          </Link>{" "}
          / analysis
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-balance">
            Analyzing <span className="font-mono">{commit?.sha.slice(0, 10)}</span>
          </h1>
          <RunStatusBadge status={run.status as RunStatus} />
        </div>
        <p className="mt-1 text-sm text-neutral-500 text-pretty">
          This page returns to the repository as soon as the analysis completes.
        </p>
      </header>

      <Card title="Progress">
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
    </div>
  );
}
