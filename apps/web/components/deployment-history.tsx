import { Card, EmptyState, cn } from "./ui";
import { RocketLaunchIcon, SealCheckIcon, StackIcon } from "./icons";

export interface DeploymentSummary {
  id: string;
  version: number;
  config_hash: string;
  tool_count: number;
  created_at: string;
}

function timestamp(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/**
 * Every immutable version this project has published, newest first.
 */
export function DeploymentHistory({
  deployments,
  currentId,
}: {
  deployments: DeploymentSummary[];
  /** The version serving traffic right now. */
  currentId?: string;
}) {
  return (
    <Card title="Deployment history" icon={StackIcon} bodyClass="">
      {deployments.length === 0 ? (
        <EmptyState
          icon={RocketLaunchIcon}
          title="Nothing deployed yet"
          hint={
            <>
              Run{" "}
              <code className="text-neutral-200">npx sodiumtools deploy</code>{" "}
              in your app to publish the first version.
            </>
          }
        />
      ) : (
        <ol className="divide-y divide-white/[0.07]">
          {deployments.map((deployment) => {
            const live = deployment.id === currentId;
            return (
              <li
                key={deployment.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-md font-mono text-xs tabular-nums",
                    live
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "bg-white/[0.05] text-neutral-300",
                  )}
                >
                  v{deployment.version}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-neutral-200 tabular-nums">
                    {deployment.tool_count} tool
                    {deployment.tool_count === 1 ? "" : "s"}
                  </span>
                  <code
                    className="block truncate font-mono text-xs text-faint"
                    title={deployment.config_hash}
                  >
                    {deployment.config_hash.slice(0, 12)}
                  </code>
                </span>
                <time
                  className="hidden shrink-0 text-xs text-faint sm:block"
                  dateTime={deployment.created_at}
                >
                  {timestamp(deployment.created_at)}
                </time>
                {live && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-300">
                    <SealCheckIcon
                      aria-hidden
                      weight="fill"
                      className="size-3.5"
                    />
                    live
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
