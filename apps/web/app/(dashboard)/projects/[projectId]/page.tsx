import Link from "next/link";
import { SodiumConfigSchema } from "sodium-webmcp-spec";
import { AgentAnalyticsDashboard } from "@/components/agent-analytics-dashboard";
import { DeleteProjectDialog } from "@/components/delete-project-dialog";
import { DeploymentHistory } from "@/components/deployment-history";
import { ToolTable } from "@/components/tool-table";
import { Card, cn, dangerButtonClass, frameClass } from "@/components/ui";
import { getProjectDashboard } from "@/lib/queries";
import { normalizeToolAnalytics } from "@/lib/tool-analytics";
import { toolDetails } from "@/lib/tool-details";
import {
  ArrowLeftIcon,
  BroadcastIcon,
  ClockIcon,
  GlobeIcon,
  SealCheckIcon,
  WrenchIcon,
} from "@/components/icons";

function timestamp(value: string): string {
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
  const {
    project,
    deployments,
    analytics: analyticsData,
  } = await getProjectDashboard(projectId, periodDays);
  const current =
    deployments.find(
      (deployment) => deployment.id === project.current_deployment_id,
    ) ?? deployments[0];
  const parsed = SodiumConfigSchema.safeParse(current?.config);
  const config = parsed.success ? parsed.data : null;
  const analytics = normalizeToolAnalytics(
    analyticsData,
    config?.tools ?? [],
    periodDays,
  );
  const tools = toolDetails(config?.tools ?? [], analytics.tools);

  return (
    <div className="space-y-8 pb-10">
      <header>
        <Link
          href="/"
          className="group mb-5 inline-flex items-center gap-1.5 text-sm text-neutral-400 transition-colors hover:text-neutral-100"
        >
          <ArrowLeftIcon
            aria-hidden
            weight="bold"
            className="size-4 transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none"
          />
          Projects
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-medium text-neutral-100 text-balance">
              {project.name}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-faint">
              <span>{project.id}</span>
              {config && (
                <span className="inline-flex items-center gap-1.5">
                  <GlobeIcon aria-hidden className="size-3.5" />
                  {config.app.origins.join(", ")}
                </span>
              )}
            </p>
          </div>
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs sm:justify-end">
            <div className="inline-flex items-baseline gap-1.5">
              <dt className="text-faint">Live</dt>
              <dd
                className={cn(
                  "inline-flex items-center gap-1.5 font-medium",
                  current ? "text-emerald-400" : "text-neutral-400",
                )}
              >
                <SealCheckIcon aria-hidden weight="fill" className="size-3.5" />
                {current ? `v${current.version}` : "not deployed"}
              </dd>
            </div>
            <div className="inline-flex items-baseline gap-1.5">
              <dt className="text-faint">Tools</dt>
              <dd className="font-medium text-neutral-200 tabular-nums">
                {tools.length}
              </dd>
            </div>
            <div className="inline-flex items-baseline gap-1.5">
              <dt className="text-faint">Updated</dt>
              <dd className="font-medium text-neutral-200">
                <time dateTime={project.updated_at}>
                  {timestamp(project.updated_at)}
                </time>
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <AgentAnalyticsDashboard projectId={projectId} analytics={analytics} />

      <section className="space-y-4" aria-labelledby="deployed-tools-title">
        <div>
          <h2
            id="deployed-tools-title"
            className="flex items-center gap-2 text-base font-medium text-balance"
          >
            <WrenchIcon aria-hidden className="size-4.5 shrink-0 text-faint" />
            Deployed tools
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-400 text-pretty">
            The contract that is live right now. Open a tool to read its input
            schema, its routes, and how it runs.
          </p>
        </div>
        <div className={cn(frameClass, "overflow-hidden")}>
          <ToolTable tools={tools} />
        </div>
      </section>

      <section
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] lg:items-start"
        aria-label="Deployment details"
      >
        <DeploymentHistory deployments={deployments} currentId={current?.id} />

        <div className="space-y-4">
          <Card title="Last event" icon={ClockIcon}>
            <p className="text-sm text-neutral-200">
              {analytics.lastSeenAt
                ? timestamp(analytics.lastSeenAt)
                : "Waiting for traffic"}
            </p>
            <p className="mt-3 border-t border-white/[0.07] pt-3 text-xs leading-5 text-faint text-pretty">
              Events are written as they arrive, so a call can take a few
              seconds to appear here.
            </p>
          </Card>

          <Card title="Collecting from" icon={BroadcastIcon}>
            {config ? (
              <ul className="space-y-1.5 font-mono text-xs text-neutral-200">
                {config.app.origins.map((origin) => (
                  <li key={origin} className="truncate" title={origin}>
                    {origin}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-400 text-pretty">
                No origins yet. They come from the{" "}
                <code className="font-mono text-xs text-neutral-300">
                  app.origins
                </code>{" "}
                list in your sodium.json.
              </p>
            )}
            <p className="mt-3 border-t border-white/[0.07] pt-3 text-xs leading-5 text-faint text-pretty">
              Events from any other origin are discarded.
            </p>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-4 border-t border-white/[0.07] pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-medium text-neutral-200">Danger zone</h2>
          <p className="mt-1 text-sm text-neutral-400 text-pretty">
            Deleting this project removes every deployment and every event with
            it. Your application repository is untouched.
          </p>
        </div>
        <DeleteProjectDialog
          projectId={project.id}
          projectName={project.name}
          className={dangerButtonClass}
        />
      </section>
    </div>
  );
}
