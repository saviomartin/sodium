import type { ReactNode } from "react";
import type { ToolManifest } from "@sodium/contracts";
import type { getPublication } from "@/lib/queries";
import { siteUrl } from "@/lib/env";
import { publishSiteAction, rollbackManifestAction } from "@/lib/actions";
import { ConfirmAction } from "./confirm-action";
import { CopySnippet } from "./copy-snippet";
import { OriginsEditor } from "./origins-editor";
import { Card, frameClass } from "./ui";
import {
  ClockCounterClockwiseIcon,
  CodeIcon,
  FingerprintIcon,
  GlobeIcon,
  InfoIcon,
  LockKeyIcon,
  PulseIcon,
  RocketLaunchIcon,
  SealCheckIcon,
} from "./icons";

type Publication = Awaited<ReturnType<typeof getPublication>>;

interface RepositoryIntegrationProps {
  site: {
    id: string;
    site_id: string;
    allowed_origins: string[];
    current_manifest_id: string | null;
  };
  publication: Publication;
  locked?: boolean;
  unlockAction?: ReactNode;
}

export function RepositoryIntegration({
  site,
  publication,
  locked = false,
  unlockAction,
}: RepositoryIntegrationProps) {
  const { contracts, manifests, deployments, usage } = publication;
  const activeContracts = contracts.filter(
    (contract) => contract.status === "active",
  );
  const current = manifests.find(
    (manifest) => manifest.id === site.current_manifest_id,
  );
  const currentContent = current?.manifest as unknown as ToolManifest | null;
  const draftToolNames = activeContracts
    .map((contract) => contract.name)
    .sort();
  const liveToolNames = (currentContent?.tools ?? [])
    .map((tool) => tool.name)
    .sort();
  const draftOrigins = [...site.allowed_origins].sort();
  const liveOrigins = [...(currentContent?.origins ?? [])].sort();
  const hasUnpublishedChanges =
    !current ||
    JSON.stringify(draftToolNames) !== JSON.stringify(liveToolNames) ||
    JSON.stringify(draftOrigins) !== JSON.stringify(liveOrigins);
  const lastLoaderReady = usage.find((event) => event.event === "loader_ready");
  const publicUrl = siteUrl();
  const snippet =
    '<script src="' +
    publicUrl +
    '/agent/v1.js" data-site="' +
    site.site_id +
    '"></script>';
  const publishDescription =
    "Signs and publishes " +
    activeContracts.length +
    " enabled tool(s) for " +
    site.allowed_origins.join(", ") +
    ".";

  return (
    <section aria-labelledby="install-access-title" className="space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id="install-access-title"
            className="flex items-center gap-2 text-base font-medium text-balance"
          >
            <CodeIcon aria-hidden className="size-4.5 shrink-0 text-faint" />
            Install &amp; access
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-400 text-pretty">
            Add the loader once and choose where it can run. Every published
            tool executes through this script with no customer integration code.
          </p>
          {locked ? (
            <p
              role="status"
              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-blue-400 text-pretty"
            >
              <LockKeyIcon
                aria-hidden
                weight="fill"
                className="size-4 shrink-0"
              />
              Preview mode. Subscribe to configure, copy, publish, or roll back.
            </p>
          ) : null}
        </div>
        {locked ? unlockAction : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Loader snippet" icon={CodeIcon}>
          <p className="mb-3 text-sm text-neutral-400 text-pretty">
            Add this line to your document head. It only registers the tools
            enabled above and only on an allowed origin.
          </p>
          <CopySnippet snippet={snippet} />
          <dl className="mt-4 text-sm">
            <dt className="flex items-center gap-1 text-xs text-neutral-400">
              <FingerprintIcon aria-hidden className="size-3.5" />
              Site ID
            </dt>
            <dd className="font-mono text-xs break-all">{site.site_id}</dd>
          </dl>
        </Card>

        <Card title="Allowed origins" icon={GlobeIcon}>
          <OriginsEditor
            siteId={site.id}
            initialOrigins={site.allowed_origins}
          />
        </Card>

        <Card title="Runtime status" icon={PulseIcon}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="flex items-center gap-1 text-xs text-neutral-400">
                <RocketLaunchIcon aria-hidden className="size-3.5" />
                Published tools
              </dt>
              <dd className="font-medium tabular-nums">
                {currentContent?.tools.length ?? 0}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs text-neutral-400">
                <SealCheckIcon aria-hidden className="size-3.5" />
                Live manifest
              </dt>
              <dd className="font-medium tabular-nums">
                {current ? "Version " + current.version : "Not published"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-neutral-400 text-pretty">
            {locked
              ? "Subscribe to activate the loader and begin receiving runtime activity."
              : lastLoaderReady
                ? "Loader last ready " +
                  new Date(lastLoaderReady.created_at).toLocaleString() +
                  "."
                : "No loader activity received yet. Install the snippet and open an allowed origin to verify it."}
          </p>
          {(activeContracts.length > 0 || current) &&
          site.allowed_origins.length > 0 ? (
            <div className="mt-4">
              <ConfirmAction
                action={publishSiteAction}
                trigger={current ? "Republish now" : "Publish now"}
                title="Publish current tool settings"
                description={publishDescription}
                confirmLabel="Publish manifest"
                triggerVariant={hasUnpublishedChanges ? "primary" : "secondary"}
                blockWhileEdits
                subscriberAction="publish tools"
                fields={{ siteId: site.id }}
                successEvent={{
                  name: "Manifest Published",
                  properties: {
                    mode: current ? "republish" : "first_publish",
                    toolCount: activeContracts.length,
                  },
                }}
              />
              <p className="mt-2 flex items-center gap-1.5 text-xs text-neutral-400">
                {hasUnpublishedChanges ? (
                  <InfoIcon
                    aria-hidden
                    weight="fill"
                    className="size-3.5 shrink-0 text-amber-300"
                  />
                ) : (
                  <SealCheckIcon
                    aria-hidden
                    weight="fill"
                    className="size-3.5 shrink-0 text-emerald-400"
                  />
                )}
                {hasUnpublishedChanges
                  ? "Unpublished tool or origin changes are ready."
                  : "Live settings match your current edits."}
              </p>
            </div>
          ) : null}
        </Card>
      </div>

      {manifests.length > 0 || usage.length > 0 ? (
        <details className={frameClass}>
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
            <ClockCounterClockwiseIcon
              aria-hidden
              className="size-4 text-faint"
            />
            Versions, rollback &amp; activity
          </summary>
          <div className="space-y-5 border-t border-white/[0.07] p-4">
            {manifests.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs text-neutral-400">
                      <th className="py-2 pr-3 font-medium">Version</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 font-medium">Tools</th>
                      <th className="py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.07]">
                    {manifests.map((manifest) => {
                      const content =
                        manifest.manifest as unknown as ToolManifest;
                      const isCurrent =
                        manifest.id === site.current_manifest_id;
                      return (
                        <tr key={manifest.id}>
                          <td className="py-2 pr-3 tabular-nums">
                            v{manifest.version}
                            {isCurrent ? (
                              <span className="ml-1 inline-flex items-center gap-1 text-xs text-emerald-400">
                                <SealCheckIcon
                                  aria-hidden
                                  weight="fill"
                                  className="size-3.5"
                                />
                                live
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 text-xs">
                            {manifest.status}
                          </td>
                          <td className="py-2 pr-3 text-xs tabular-nums">
                            {content.tools?.length ?? 0}
                          </td>
                          <td className="py-2 text-right">
                            {!isCurrent && manifest.status !== "draft" ? (
                              <ConfirmAction
                                action={rollbackManifestAction}
                                trigger="Roll back to this"
                                triggerIcon="rollback"
                                title={"Roll back to v" + manifest.version}
                                description="Re-signs this version's exact tool set as a new live version. Nothing is deleted from history."
                                confirmLabel="Roll back"
                                danger
                                subscriberAction="roll back a manifest"
                                fields={{
                                  siteId: site.id,
                                  manifestId: manifest.id,
                                }}
                                successEvent={{
                                  name: "Manifest Rolled Back",
                                  properties: { version: manifest.version },
                                }}
                              />
                            ) : null}
                            {manifest.status === "draft" ? (
                              <span className="text-xs text-amber-300">
                                Review compatibility findings before publishing
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            {deployments.length > 0 ? (
              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-medium text-neutral-300">
                  <RocketLaunchIcon
                    aria-hidden
                    className="size-3.5 text-faint"
                  />
                  Deployment history
                </h3>
                <ul className="mt-2 space-y-1 text-xs text-neutral-400 tabular-nums">
                  {deployments.map((deployment, index) => (
                    <li key={deployment.manifest_id + ":" + index}>
                      {new Date(deployment.created_at).toLocaleString()} ·{" "}
                      {deployment.action}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {usage.length > 0 ? (
              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-medium text-neutral-300">
                  <PulseIcon aria-hidden className="size-3.5 text-faint" />
                  Loader activity
                </h3>
                {/* Event payloads are arbitrary JSON with no spaces to wrap
                    on, so they need an explicit break to stay in the panel. */}
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs break-all text-neutral-400 tabular-nums">
                  {usage.map((event, index) => (
                    <li key={event.created_at + ":" + index}>
                      {new Date(event.created_at).toLocaleString()} ·{" "}
                      {event.event} · {JSON.stringify(event.data)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}
