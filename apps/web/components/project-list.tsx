import Link from "next/link";
import type { AwaitedReturn } from "@/lib/types";
import type { listProjects } from "@/lib/queries";
import { cn } from "./ui";
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

/** Shared by the header strip and every row, so the columns cannot drift. */
const ROW_CLASS =
  "grid gap-3 sm:grid-cols-[minmax(0,1fr)_5rem_6rem_6rem_1.5rem] sm:items-center sm:gap-4";

export function ProjectList({
  projects,
}: {
  projects: AwaitedReturn<typeof listProjects>;
}) {
  // The empty case is a different layout, not a different row, so the page
  // renders its own panel for it rather than passing an empty list here.
  if (projects.length === 0) return null;

  return (
    <div>
      <div
        className={cn(
          ROW_CLASS,
          "hidden border-b border-white/[0.07] px-4 py-2.5 font-mono text-[10px] uppercase text-faint sm:grid",
        )}
      >
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
            className={cn(
              ROW_CLASS,
              "group px-4 py-4 transition-colors hover:bg-white/[0.035]",
            )}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-neutral-400">
                <CubeIcon aria-hidden className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-neutral-100">
                  {project.name}
                </span>
                <code className="mt-0.5 block truncate font-mono text-[11px] text-faint">
                  {project.id}
                </code>
              </span>
            </span>
            <span className="hidden font-mono text-xs text-neutral-300 tabular-nums sm:block">
              {project.deployment ? `v${project.deployment.version}` : "—"}
            </span>
            <span className="hidden text-xs text-neutral-400 sm:block">
              {project.deployment
                ? `${project.deployment.tool_count} live`
                : "Not deployed"}
            </span>
            <time
              className="hidden text-xs text-faint sm:block"
              dateTime={project.updated_at}
            >
              {relativeDate(project.updated_at)}
            </time>
            <ArrowRightIcon
              aria-hidden
              weight="bold"
              className="hidden size-4 text-neutral-600 transition-transform group-hover:translate-x-0.5 group-hover:text-neutral-300 motion-reduce:transition-none sm:block"
            />
            {/* One line replaces the four columns below `sm`, where a grid of
                five would wrap into an unreadable stack. */}
            <span className="flex items-center justify-between text-xs text-neutral-400 sm:hidden">
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
