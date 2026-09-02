import Link from "next/link";
import type { AwaitedReturn } from "@/lib/types";
import type { listProjects } from "@/lib/queries";
import { frameClass } from "./ui";
import { ArrowRightIcon, CubeIcon, PulseIcon } from "./icons";

function relativeDate(value: string): string {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000),
  );
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export function ProjectList({
  projects,
}: {
  projects: AwaitedReturn<typeof listProjects>;
}) {
  if (projects.length === 0) {
    return (
      <div className={`${frameClass} px-5 py-12 text-center`}>
        <CubeIcon aria-hidden className="mx-auto size-6 text-neutral-600" />
        <p className="mt-4 text-sm font-medium text-neutral-100">
          No projects yet
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-500">
          Run <code className="text-neutral-300">npx sodium-webmcp init</code>{" "}
          in an app with a valid sodium.json. Sodium creates the project during
          your first deploy.
        </p>
      </div>
    );
  }

  return (
    <div className={`${frameClass} overflow-hidden`}>
      <div className="hidden grid-cols-[minmax(0,1fr)_7rem_7rem_6rem_1.5rem] gap-4 border-b border-white/[0.07] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-600 sm:grid">
        <span>Project</span>
        <span>Version</span>
        <span>Tools</span>
        <span>Updated</span>
        <span />
      </div>
      <div className="divide-y divide-white/[0.07]">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="group grid gap-3 px-4 py-4 transition-colors hover:bg-white/[0.035] sm:grid-cols-[minmax(0,1fr)_7rem_7rem_6rem_1.5rem] sm:items-center sm:gap-4"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-neutral-400">
                <CubeIcon aria-hidden className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-neutral-100">
                  {project.name}
                </span>
                <code className="mt-0.5 block truncate text-[11px] text-neutral-600">
                  {project.id}
                </code>
              </span>
            </span>
            <span className="hidden font-mono text-xs text-neutral-300 sm:block">
              {project.deployment ? `v${project.deployment.version}` : "—"}
            </span>
            <span className="hidden text-xs text-neutral-400 sm:block">
              {project.deployment
                ? `${project.deployment.tool_count} live`
                : "Not deployed"}
            </span>
            <time
              className="hidden text-xs text-neutral-500 sm:block"
              dateTime={project.updated_at}
            >
              {relativeDate(project.updated_at)}
            </time>
            <ArrowRightIcon
              aria-hidden
              weight="bold"
              className="hidden size-4 text-neutral-600 transition-transform group-hover:translate-x-0.5 group-hover:text-neutral-300 sm:block"
            />
            <span className="flex items-center justify-between text-xs text-neutral-500 sm:hidden">
              <span className="inline-flex items-center gap-1.5">
                <PulseIcon aria-hidden className="size-3.5" />
                {project.deployment
                  ? `v${project.deployment.version} · ${project.deployment.tool_count} tools`
                  : "Waiting for deploy"}
              </span>
              <span>{relativeDate(project.updated_at)}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
