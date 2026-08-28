import Link from "next/link";
import { notFound } from "next/navigation";
import type { ToolManifest } from "@sodium/contracts";
import { env } from "@/lib/env";
import {
  getPublication,
  getRecentUsage,
  getRepository,
  getSiteForRepository,
} from "@/lib/queries";
import {
  generateIntegrationPrAction,
  publishSiteAction,
  rollbackManifestAction,
  updateSiteOriginsAction,
} from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ConfirmAction } from "@/components/confirm-action";
import { CopySnippet } from "@/components/copy-snippet";
import {
  Card,
  EmptyState,
  Field,
  inputClass,
  secondaryButtonClass,
} from "@/components/ui";

export const metadata = { title: "Publish" };

export default async function PublishPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = await getRepository(id);
  if (!repo) notFound();
  const site = await getSiteForRepository(id);
  if (!site) {
    return (
      <EmptyState
        title="No site yet"
        hint="Connecting a repository creates its site record. Re-run onboarding."
      />
    );
  }
  const [{ contracts, manifests, deployments, prs }, usage] = await Promise.all(
    [getPublication(site.id), getRecentUsage(site.id)],
  );

  const activeContracts = contracts.filter(
    (contract) => contract.status === "active",
  );
  const current = manifests.find(
    (manifest) => manifest.id === site.current_manifest_id,
  );
  const snippet = `<script src="${env.SITE_URL}/agent/v1.js" data-site="${site.site_id}"></script>`;
  const lastLoaderReady = usage.find((event) => event.event === "loader_ready");
  const stateChanging = activeContracts.length > 0;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs text-neutral-400">
          <Link href={`/repos/${repo.id}`} className="hover:underline">
            {repo.full_name}
          </Link>{" "}
          / publish
        </p>
        <h1 className="text-lg font-semibold text-balance">
          Publish &amp; loader
        </h1>
        <p className="mt-1 text-sm text-neutral-500 text-pretty">
          Published tools are available to compatible WebMCP browser agents
          while your application is open — currently Chrome/Edge origin-trial
          builds with WebMCP enabled.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title="Loader installation">
            <p className="mb-2 text-sm text-neutral-600 text-pretty">
              One line in your document head. The loader is versioned,
              immutable, shared by every site, and registers nothing unless a
              validly signed manifest exists for this exact origin.
            </p>
            <CopySnippet snippet={snippet} />
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-neutral-500">Site ID</dt>
                <dd className="font-mono text-xs">{site.site_id}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Manifest endpoint</dt>
                <dd className="font-mono text-xs break-all">
                  {env.SITE_URL}/api/m/{site.site_id}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Allowed origins">
            <ActionForm
              action={updateSiteOriginsAction}
              className="space-y-3"
              successMessage="Origins updated."
            >
              <input type="hidden" name="siteId" value={site.id} />
              <Field
                label="One origin per line"
                hint="Exact match including scheme and port. The loader refuses to register tools anywhere else."
              >
                <textarea
                  name="origins"
                  rows={3}
                  defaultValue={site.allowed_origins.join("\n")}
                  className={inputClass}
                />
              </Field>
              <SubmitButton className={secondaryButtonClass}>
                Save origins
              </SubmitButton>
            </ActionForm>
          </Card>

          <Card title="Environment health">
            {usage.length === 0 ? (
              <p className="text-sm text-neutral-500 text-pretty">
                No loader telemetry yet. Once the snippet is installed and a
                manifest is published, minimal operational events (never tool
                inputs or page content) appear here.
              </p>
            ) : (
              <div className="space-y-2 text-sm">
                {lastLoaderReady && (
                  <p className="text-green-700">
                    Loader last ready{" "}
                    {new Date(lastLoaderReady.created_at).toLocaleString()} —{" "}
                    {JSON.stringify(lastLoaderReady.data)}
                  </p>
                )}
                <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-neutral-500 tabular-nums">
                  {usage.map((event, index) => (
                    <li key={index}>
                      {new Date(event.created_at).toLocaleTimeString()} ·{" "}
                      {event.event} · {JSON.stringify(event.data)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={`Approved tools (${activeContracts.length})`}>
            {activeContracts.length === 0 ? (
              <EmptyState
                title="Nothing approved yet"
                hint="Approve candidates from an analysis run first. State-changing tools are never published automatically."
              />
            ) : (
              <div className="space-y-3">
                <ul className="space-y-1 text-sm">
                  {activeContracts.map((contract) => (
                    <li key={contract.id} className="font-mono text-xs">
                      {contract.name}
                    </li>
                  ))}
                </ul>
                <ConfirmAction
                  action={publishSiteAction}
                  trigger={current ? "Publish new version" : "Publish manifest"}
                  title="Publish signed manifest"
                  description={`This signs and atomically publishes ${activeContracts.length} approved tool(s) for ${site.allowed_origins.join(", ") || "(no origins configured)"}. Compatible WebMCP browser agents can invoke them while the site is open.`}
                  confirmLabel="Sign & publish"
                  fields={{ siteId: site.id }}
                />
              </div>
            )}
          </Card>

          <Card title="Integration PR">
            <p className="mb-3 text-sm text-neutral-600 text-pretty">
              Generates a reviewable pull request adding the pinned loader and a
              first-party action bridge that binds approved tools to your
              existing functions. Never pushes to {repo.default_branch}.
            </p>
            {stateChanging ? (
              <ActionForm
                action={generateIntegrationPrAction}
                successMessage="PR generation queued."
              >
                <input type="hidden" name="siteId" value={site.id} />
                <SubmitButton
                  className={secondaryButtonClass}
                  pendingText="Queueing…"
                >
                  Generate integration PR
                </SubmitButton>
              </ActionForm>
            ) : (
              <p className="text-sm text-neutral-400">
                Approve at least one tool first.
              </p>
            )}
            {prs.length > 0 && (
              <ul className="mt-3 space-y-2 text-sm">
                {prs.map((pr) => (
                  <li
                    key={pr.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>
                      <span
                        className={`mr-2 inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${
                          pr.status === "open" || pr.status === "merged"
                            ? "bg-green-50 text-green-700"
                            : pr.status === "failed"
                              ? "bg-red-50 text-red-700"
                              : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {pr.status}
                      </span>
                      <span className="font-mono text-xs">{pr.branch}</span>
                      {pr.error ? (
                        <span className="ml-2 text-xs text-red-600">
                          {(pr.error as { message?: string }).message}
                        </span>
                      ) : null}
                    </span>
                    {pr.url &&
                      (pr.url.startsWith("http") ? (
                        <a
                          href={pr.url}
                          className="text-xs font-medium text-blue-700 hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {pr.pr_number ? `#${pr.pr_number}` : "open"} ↗
                        </a>
                      ) : (
                        <span className="font-mono text-xs text-neutral-500 break-all">
                          {pr.url}
                        </span>
                      ))}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Manifest versions & rollback">
            {manifests.length === 0 ? (
              <p className="text-sm text-neutral-500">Nothing published yet.</p>
            ) : (
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
                    const isCurrent = manifest.id === site.current_manifest_id;
                    return (
                      <tr key={manifest.id}>
                        <td className="py-2 pr-3 tabular-nums">
                          v{manifest.version}
                          {isCurrent && (
                            <span className="ml-1 text-xs text-green-700">
                              (live)
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-xs">{manifest.status}</td>
                        <td className="py-2 pr-3 text-xs tabular-nums">
                          {content.tools?.length ?? 0}
                        </td>
                        <td className="py-2 text-right">
                          {!isCurrent && manifest.status !== "draft" && (
                            <ConfirmAction
                              action={rollbackManifestAction}
                              trigger="Roll back to this"
                              title={`Roll back to v${manifest.version}`}
                              description="Re-signs this version's exact content as a new manifest version and atomically makes it live. The current version stays in history."
                              confirmLabel="Roll back"
                              danger
                              fields={{
                                siteId: site.id,
                                manifestId: manifest.id,
                              }}
                            />
                          )}
                          {manifest.status === "draft" && (
                            <span className="text-xs text-amber-700">
                              draft from sync — publish to adopt
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {deployments.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-neutral-500">
                  Deployment history
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-neutral-500 tabular-nums">
                  {deployments.map((deployment, index) => (
                    <li key={index}>
                      {new Date(deployment.created_at).toLocaleString()} ·{" "}
                      {deployment.action}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
