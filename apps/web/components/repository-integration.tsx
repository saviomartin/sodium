import type { ToolManifest } from "@sodium/contracts";
import type { getPublication } from "@/lib/queries";
import { siteUrl } from "@/lib/env";
import { publishSiteAction, rollbackManifestAction } from "@/lib/actions";
import { ConfirmAction } from "./confirm-action";
import { CopySnippet } from "./copy-snippet";
import { OriginsEditor } from "./origins-editor";
import { Card } from "./ui";

type Publication = Awaited<ReturnType<typeof getPublication>>;

interface RepositoryIntegrationProps {
  site: {
    id: string;
    site_id: string;
    allowed_origins: string[];
    current_manifest_id: string | null;
  };
  publication: Publication;
}

export function RepositoryIntegration({
  site,
  publication,
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
  const manifestUrl = publicUrl + "/api/m/" + site.site_id;
  const publishDescription =
    "Signs and publishes " +
    activeContracts.length +
    " enabled tool(s) for " +
    site.allowed_origins.join(", ") +
    ".";

  return (
    <section aria-labelledby="install-access-title" className="space-y-3">
      <header>
        <h2
          id="install-access-title"
          className="text-base font-semibold text-balance"
        >
          Install &amp; access
        </h2>
        <p className="mt-1 text-sm text-neutral-500 text-pretty">
          Add the loader once and choose where it can run. Every published tool
          executes through this script with no customer integration code.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Loader snippet">
          <p className="mb-3 text-sm text-neutral-600 text-pretty">
            Add this line to your document head. It only registers the tools
            enabled above and only on an allowed origin.
          </p>
          <CopySnippet snippet={snippet} />
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-neutral-500">Site ID</dt>
              <dd className="font-mono text-xs break-all">{site.site_id}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Manifest endpoint</dt>
              <dd className="text-xs break-all">
                <a
                  href={manifestUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-blue-700 hover:underline"
                >
                  {manifestUrl} ↗
                </a>
              </dd>
            </div>
          </dl>
        </Card>

        <Card title="Allowed origins">
          <OriginsEditor
            siteId={site.id}
            initialOrigins={site.allowed_origins}
          />
        </Card>

        <Card title="Runtime status">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-neutral-500">Published tools</dt>
              <dd className="font-medium tabular-nums">
                {currentContent?.tools.length ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Live manifest</dt>
              <dd className="font-medium tabular-nums">
                {current ? "Version " + current.version : "Not published"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-neutral-500 text-pretty">
            {lastLoaderReady
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
                fields={{ siteId: site.id }}
                successEvent={{
                  name: "Manifest Published",
                  properties: {
                    mode: current ? "republish" : "first_publish",
                    toolCount: activeContracts.length,
                  },
                }}
              />
              <p className="mt-2 text-xs text-neutral-500">
                {hasUnpublishedChanges
                  ? "Unpublished tool or origin changes are ready."
                  : "Live settings match your current edits."}
              </p>
            </div>
          ) : null}
        </Card>
      </div>

      {manifests.length > 0 || usage.length > 0 ? (
        <details className="rounded-lg border border-neutral-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
            Versions, rollback &amp; activity
          </summary>
          <div className="space-y-5 border-t border-neutral-100 p-4">
            {manifests.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                      <th className="py-2 pr-3 font-medium">Version</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 font-medium">Tools</th>
                      <th className="py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
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
                              <span className="ml-1 text-xs text-green-700">
                                (live)
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
                                title={"Roll back to v" + manifest.version}
                                description="Re-signs this version's exact tool set as a new live version. Nothing is deleted from history."
                                confirmLabel="Roll back"
                                danger
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
                              <span className="text-xs text-amber-700">
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
                <h3 className="text-xs font-semibold text-neutral-700">
                  Deployment history
                </h3>
                <ul className="mt-2 space-y-1 text-xs text-neutral-500 tabular-nums">
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
                <h3 className="text-xs font-semibold text-neutral-700">
                  Loader activity
                </h3>
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-neutral-500 tabular-nums">
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
