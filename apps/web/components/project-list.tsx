import Link from "next/link";
import type { AwaitedReturn } from "@/lib/types";
import type { listProjects } from "@/lib/queries";
import { ArrowRightIcon, CubeIcon } from "./icons";

export function ProjectList({
  projects,
}: {
  projects: AwaitedReturn<typeof listProjects>;
}) {
  if (projects.length === 0) {
    return (
      <div className="frame px-5 py-10 text-center">
        <p className="text-sm font-medium text-neutral-100">No projects yet</p>
        <p className="mt-2 text-sm text-neutral-500">
          Run the command above inside an app with a valid sodium.json.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {projects.map((project) => (
        <Link
          key={project.id}
          href={`/projects/${project.id}`}
          className="frame group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-white/[0.035]"
        >
          <span className="flex size-9 items-center justify-center rounded-md bg-white/[0.06] text-neutral-400">
            <CubeIcon aria-hidden className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-neutral-100">
              {project.name}
            </span>
            <span className="mt-1 block text-xs text-neutral-500">
              {project.deployment
                ? `v${project.deployment.version} · ${project.deployment.tool_count} tools`
                : "Waiting for first deployment"}
            </span>
          </span>
          <ArrowRightIcon
            aria-hidden
            className="size-4 text-neutral-600 transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      ))}
    </div>
  );
}
