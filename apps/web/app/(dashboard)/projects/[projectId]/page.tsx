import Link from "next/link";
import { SodiumConfigSchema } from "sodium-webmcp-spec";
import { Card, secondaryButtonClass } from "@/components/ui";
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

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { project, deployments, events } = await getProjectDashboard(projectId);
  const current =
    deployments.find(
      (deployment) => deployment.id === project.current_deployment_id,
    ) ?? deployments[0];
  const parsed = SodiumConfigSchema.safeParse(current?.config);
  const tools = parsed.success ? parsed.data.tools : [];
  const analytics = summarizeToolAnalytics(events, tools);

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-200"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          Projects
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-600">
              Last 30 days
            </p>
            <h1 className="mt-2 text-3xl font-medium tracking-tight text-neutral-100">
              {project.name}
            </h1>
          </div>
          <code className="text-xs text-neutral-500">{project.id}</code>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Tool calls" value={String(analytics.calls)} />
        <Metric
          label="Success rate"
          value={percentage(analytics.successRate)}
        />
        <Metric label="p95 latency" value={duration(analytics.p95Ms)} />
        <Metric label="Denied" value={String(analytics.denied)} />
      </div>

      <Card title="Tools" icon={ChartLineUpIcon}>
        {tools.length === 0 ? (
          <EmptyDeploy />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-neutral-600">
                <tr>
                  <th className="pb-3">Tool</th>
                  <th className="pb-3">Risk</th>
                  <th className="pb-3 text-right">Calls</th>
                  <th className="pb-3 text-right">Success</th>
                  <th className="pb-3 text-right">p95</th>
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
                    <td className="py-3 text-right text-neutral-300">
                      {tool.calls}
                    </td>
                    <td className="py-3 text-right text-neutral-300">
                      {percentage(tool.successRate)}
                    </td>
                    <td className="py-3 text-right text-neutral-300">
                      {duration(tool.p95Ms)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Deployments" icon={StackIcon}>
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
                <time
                  className="text-xs text-neutral-600"
                  dateTime={deployment.created_at}
                >
                  {date(deployment.created_at)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <p className="flex items-center gap-2 text-xs text-neutral-600">
        <ClockIcon aria-hidden className="size-4" />
        Last event:{" "}
        {analytics.lastSeenAt
          ? date(analytics.lastSeenAt)
          : "waiting for traffic"}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="frame px-4 py-4">
      <p className="text-xs text-neutral-600">{label}</p>
      <p className="mt-2 text-2xl font-medium tracking-tight text-neutral-100">
        {value}
      </p>
    </div>
  );
}

function EmptyDeploy() {
  return (
    <div className="py-4 text-center">
      <p className="text-sm text-neutral-300">No deployment yet</p>
      <p className="mt-2 text-sm text-neutral-500">
        Run <code className="text-neutral-300">npx sodium-webmcp deploy</code>{" "}
        in your app.
      </p>
      <Link className={`${secondaryButtonClass} mt-4`} href="/">
        Back to projects
      </Link>
    </div>
  );
}
