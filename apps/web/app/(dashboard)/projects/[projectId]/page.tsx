import Link from "next/link";
import { SodiumConfigSchema } from "sodium-webmcp-spec";
import { AgentAnalyticsDashboard } from "@/components/agent-analytics-dashboard";
import { Card, frameClass } from "@/components/ui";
import { getProjectDashboard } from "@/lib/queries";
import { summarizeToolAnalytics } from "@/lib/tool-analytics";
import {
  ArrowLeftIcon,
  ChartLineUpIcon,
  ClockIcon,
  StackIcon,
} from "@/components/icons";

function percentage(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function duration(value: number | null): string {
  return value === null
    ? "—"
    : value < 1000
      ? `${value} ms`
      : `${(value / 1000).toFixed(1)} s`;
}

function date(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function range(value: string | undefined): number {
  const parsed = Number(value?.replace("d", ""));
  return [7, 30, 90].includes(parsed) ? parsed : 30;
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const periodDays = range(query.range);
  const { project, deployments, events } = await getProjectDashboard(
    projectId,
    periodDays,
  );
  const current =
    deployments.find(
      (deployment) => deployment.id === project.current_deployment_id,
    ) ?? deployments[0];
  const parsed = SodiumConfigSchema.safeParse(current?.config);
  const tools = parsed.success ? parsed.data.tools : [];
  const analytics = summarizeToolAnalytics(events, tools, { periodDays });

  return (
    <div className="space-y-10 pb-10">
      <header>
        <Link
          href="/"
          className="mb-5 inline-flex items-center gap-2 text-sm text-neutral-500 transition-colors hover:text-neutral-200"
        >
          <ArrowLeftIcon aria-hidden className="size-4" /> Projects
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_9px_rgba(52,211,153,.7)]" />
              {current
                ? `Live · version ${current.version}`
                : "Awaiting deployment"}
            </div>
            <h1 className="mt-2 text-4xl font-medium tracking-[-0.035em] text-neutral-100">
              {project.name}
            </h1>
          </div>
          <div className="text-left sm:text-right">
            <code className="text-xs text-neutral-500">{project.id}</code>
            <p className="mt-1 text-xs text-neutral-600">
              Updated {date(project.updated_at)}
            </p>
          </div>
        </div>
      </header>

      <AgentAnalyticsDashboard projectId={projectId} analytics={analytics} />

      <section className="space-y-4" aria-labelledby="tool-performance-title">
        <header>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-600">
            Deployed surface
          </p>
          <h2
            id="tool-performance-title"
            className="mt-2 text-xl font-medium text-neutral-100"
          >
            Tool performance
          </h2>
        </header>
        <Card icon={ChartLineUpIcon}>
          {tools.length === 0 ? (
            <EmptyDeploy />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-600">
                  <tr>
                    <th className="pb-3">Tool</th>
                    <th className="pb-3">Risk</th>
                    <th className="pb-3 text-right">Calls</th>
                    <th className="pb-3 text-right">Success</th>
                    <th className="pb-3 text-right">Failed</th>
                    <th className="pb-3 text-right">P95</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.07]">
                  {analytics.tools.map((tool) => (
                    <tr key={tool.id}>
                      <td className="py-3">
                        <span className="block font-medium text-neutral-200">
                          {tool.title}
                        </span>
                        <code className="text-xs text-neutral-600">
                          {tool.name}
                        </code>
                      </td>
                      <td className="py-3 text-neutral-500">
                        {tool.risk.replaceAll("_", " ")}
                      </td>
                      <td className="py-3 text-right tabular-nums text-neutral-300">
                        {tool.calls}
                      </td>
                      <td className="py-3 text-right tabular-nums text-neutral-300">
                        {percentage(tool.successRate)}
                      </td>
                      <td className="py-3 text-right tabular-nums text-neutral-300">
                        {tool.failures}
                      </td>
                      <td className="py-3 text-right tabular-nums text-neutral-300">
                        {duration(tool.p95Ms)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      <section
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]"
        aria-label="Deployment details"
      >
        <Card title="Deployment history" icon={StackIcon}>
          {deployments.length === 0 ? (
            <EmptyDeploy />
          ) : (
            <ol className="divide-y divide-white/[0.07]">
              {deployments.map((deployment) => (
                <li
                  key={deployment.id}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="flex size-8 items-center justify-center rounded-md bg-white/[0.05] font-mono text-xs text-neutral-400">
                    v{deployment.version}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-neutral-300">
                      {deployment.tool_count} tools
                    </span>
                    <code className="block truncate text-xs text-neutral-600">
                      {deployment.config_hash.slice(0, 12)}
                    </code>
                  </span>
                  {deployment.id === current?.id && (
                    <span className="rounded-full bg-emerald-400/10 px-2 py-1 font-mono text-[10px] uppercase text-emerald-300">
                      live
                    </span>
                  )}
                  <time
                    className="hidden text-xs text-neutral-600 sm:block"
                    dateTime={deployment.created_at}
                  >
                    {date(deployment.created_at)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <div className={`${frameClass} h-fit p-4`}>
          <p className="flex items-center gap-2 text-xs text-neutral-500">
            <ClockIcon aria-hidden className="size-4" /> Latest telemetry
          </p>
          <p className="mt-3 text-sm text-neutral-200">
            {analytics.lastSeenAt
              ? date(analytics.lastSeenAt)
              : "Waiting for traffic"}
          </p>
          <p className="mt-4 border-t border-white/[0.07] pt-4 text-xs leading-5 text-neutral-500">
            Analytics may take a few seconds to appear after a tool runs.
          </p>
        </div>
      </section>
    </div>
  );
}

function EmptyDeploy() {
  return (
    <div className="py-5 text-center">
      <p className="text-sm text-neutral-300">No deployment yet</p>
      <p className="mt-2 text-sm text-neutral-500">
        Run{" "}
        <code className="text-neutral-300">npx @resultdev/sodium deploy</code>{" "}
        in your app.
      </p>
    </div>
  );
}
