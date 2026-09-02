import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { Landing } from "@/components/landing";
import { ProjectList } from "@/components/project-list";
import { frameClass } from "@/components/ui";
import {
  CubeIcon,
  RocketLaunchIcon,
  StackIcon,
  TerminalWindowIcon,
  WrenchIcon,
} from "@/components/icons";
import { getAccountContext, listProjects } from "@/lib/queries";
import { OPEN_GRAPH } from "@/lib/seo";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...OPEN_GRAPH, url: "/" },
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; error?: string; next?: string }>;
}) {
  const [account, params] = await Promise.all([
    getAccountContext(),
    searchParams,
  ]);
  if (!account.userId) return <Landing params={params} />;

  const projects = await listProjects();
  const liveProjects = projects.filter((project) => project.deployment);
  const toolCount = liveProjects.reduce(
    (total, project) => total + (project.deployment?.tool_count ?? 0),
    0,
  );

  return (
    <div className="min-h-dvh">
      <AppHeader
        account={{
          email: account.email,
          displayName: account.displayName,
          avatarUrl: account.avatarUrl,
        }}
      />
      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-blue-400">
              Control plane
            </p>
            <h1 className="mt-2 text-4xl font-medium tracking-[-0.035em] text-neutral-100">
              WebMCP projects
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-400">
              Deployments, tool health, and agent activity across your apps.
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.75)]" />
            Systems operational
          </div>
        </header>

        <dl className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <DashboardMetric
            icon={CubeIcon}
            label="Projects"
            value={projects.length}
          />
          <DashboardMetric
            icon={RocketLaunchIcon}
            label="Deployed"
            value={liveProjects.length}
          />
          <DashboardMetric
            icon={WrenchIcon}
            label="Live tools"
            value={toolCount}
          />
          <DashboardMetric
            icon={StackIcon}
            label="Latest version"
            value={Math.max(
              0,
              ...liveProjects.map(
                (project) => project.deployment?.version ?? 0,
              ),
            )}
            prefix="v"
          />
        </dl>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-neutral-200">
                Your projects
              </h2>
              <span className="font-mono text-[11px] text-neutral-600">
                {projects.length} total
              </span>
            </div>
            <ProjectList projects={projects} />
          </section>

          <aside className={`${frameClass} h-fit overflow-hidden`}>
            <header className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
              <TerminalWindowIcon aria-hidden className="size-4 text-faint" />
              <h2 className="text-sm font-medium text-neutral-100">
                Deploy another app
              </h2>
            </header>
            <div className="p-4">
              <ol className="space-y-4 text-sm">
                <CommandStep
                  number="01"
                  command="npx sodiumtools init"
                  text="Install and create sodium.json"
                />
                <CommandStep
                  number="02"
                  command="npx sodiumtools login"
                  text="Connect your account"
                />
                <CommandStep
                  number="03"
                  command="npx sodiumtools deploy"
                  text="Publish the contract"
                />
              </ol>
              <p className="mt-5 border-t border-white/[0.07] pt-4 text-xs leading-5 text-neutral-500">
                Run these commands from the root of your application.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function DashboardMetric({
  icon: Icon,
  label,
  value,
  prefix = "",
}: {
  icon: typeof CubeIcon;
  label: string;
  value: number;
  prefix?: string;
}) {
  return (
    <div className={frameClass}>
      <dt className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3 text-xs text-neutral-500">
        <Icon aria-hidden className="size-3.5" /> {label}
      </dt>
      <dd className="px-4 py-4 font-mono text-2xl text-neutral-100">
        {prefix}
        {value}
      </dd>
    </div>
  );
}

function CommandStep({
  number,
  command,
  text,
}: {
  number: string;
  command: string;
  text: string;
}) {
  return (
    <li className="grid grid-cols-[1.5rem_1fr] gap-2">
      <span className="font-mono text-[10px] text-neutral-600">{number}</span>
      <span>
        <code className="block text-xs text-neutral-200">{command}</code>
        <span className="mt-1 block text-xs text-neutral-500">{text}</span>
      </span>
    </li>
  );
}
