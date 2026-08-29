import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { JobError, RunStatus } from "@sodium/contracts";
import { getRepository, getRun } from "@/lib/queries";
import { Card, RunStatusBadge } from "@/components/ui";
import {
  GitCommitIcon,
  GithubMarkIcon,
  ListChecksIcon,
  WarningIcon,
} from "@/components/icons";
import { RepositoryFullName } from "@/components/repository-row";
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
        <p className="flex items-center gap-1.5 text-xs text-faint">
          <GithubMarkIcon aria-hidden className="size-3.5" />
          <span>
            <Link href={`/repos/${repo.id}`} className="hover:underline">
              <RepositoryFullName fullName={repo.full_name} />
            </Link>
            <span className="mx-1.5 text-white/25">/</span>
            analysis
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2 text-lg font-medium text-balance">
            Analyzing{" "}
            <span className="inline-flex items-center gap-1.5 font-mono">
              <GitCommitIcon aria-hidden className="size-4 text-faint" />
              {commit?.sha.slice(0, 10)}
            </span>
          </h1>
          <RunStatusBadge status={run.status as RunStatus} />
        </div>
        <p className="mt-1 text-sm text-neutral-400 text-pretty">
          This page returns to the repository as soon as the analysis completes.
        </p>
      </header>

      <Card title="Progress" icon={ListChecksIcon}>
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
            className="mt-3 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/15 px-3 py-2 text-sm text-red-400 text-pretty"
          >
            <WarningIcon
              aria-hidden
              weight="fill"
              className="mt-0.5 size-4 shrink-0"
            />
            <span>
              {error.code}: {error.message}
            </span>
          </p>
        )}
      </Card>
    </div>
  );
}
