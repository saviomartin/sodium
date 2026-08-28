import Link from "next/link";
import { listInstallationRepos } from "@/lib/github";
import { hasGithubApp } from "@/lib/env";
import { getInstallations, getRepositories } from "@/lib/queries";
import { connectGithubAction, selectRepositoryAction } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import {
  Card,
  EmptyState,
  buttonClass,
  secondaryButtonClass,
} from "@/components/ui";

export const metadata = { title: "Connect repository" };

const ERROR_MESSAGES: Record<string, string> = {
  github_state: "The GitHub connection expired. Start it again.",
  github_installation: "GitHub could not verify that installation.",
  github_access:
    "Authorize GitHub with an account that owns this installation.",
  github_store: "The GitHub connection could not be saved.",
};

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ installation?: string; error?: string }>;
}) {
  const { installation: installationParam, error } = await searchParams;
  if (!hasGithubApp()) {
    return (
      <EmptyState
        title="GitHub connection is unavailable"
        hint="This deployment is missing its GitHub App configuration."
      />
    );
  }

  const [installations, connected] = await Promise.all([
    getInstallations(),
    getRepositories(),
  ]);
  const activeInstallations = installations.filter(
    (installation) => !installation.suspended_at,
  );
  const selected =
    activeInstallations.find(
      (installation) =>
        String(installation.installation_id) === installationParam,
    ) ?? (activeInstallations.length === 1 ? activeInstallations[0] : null);

  let repositories: Awaited<ReturnType<typeof listInstallationRepos>> = [];
  let listError = "";
  if (selected) {
    try {
      repositories = await listInstallationRepos(selected.installation_id);
    } catch {
      listError =
        "GitHub could not load repositories. Reconnect the app and try again.";
    }
  }
  const connectedIds = new Map(
    connected.map((repository) => [repository.github_repo_id, repository.id]),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
            One step
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Connect a GitHub repository
          </h1>
          <p className="mt-2 max-w-xl text-sm text-neutral-500 text-pretty">
            Grant access to one repository. Sodium reads source snapshots but
            never executes your application code.
          </p>
        </div>
        <ActionForm action={connectGithubAction}>
          <SubmitButton
            className={secondaryButtonClass}
            pendingText="Opening GitHub…"
          >
            {activeInstallations.length > 0
              ? "Add or change access"
              : "Connect GitHub"}
          </SubmitButton>
        </ActionForm>
      </header>

      {(error || listError) && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {listError ||
            ERROR_MESSAGES[error ?? ""] ||
            "GitHub connection failed."}
        </p>
      )}

      {!selected && activeInstallations.length > 1 && (
        <Card title="Choose a GitHub account">
          <div className="flex flex-wrap gap-2">
            {activeInstallations.map((installation) => (
              <Link
                key={installation.id}
                href={`/connect?installation=${installation.installation_id}`}
                className={secondaryButtonClass}
              >
                {installation.account_login}
              </Link>
            ))}
          </div>
        </Card>
      )}

      {selected ? (
        <Card title={`${selected.account_login} repositories`}>
          {repositories.length === 0 ? (
            <EmptyState
              title="No repositories available"
              hint="Update the GitHub App installation to grant access to a repository."
              action={
                <ActionForm action={connectGithubAction}>
                  <SubmitButton
                    className={buttonClass}
                    pendingText="Opening GitHub…"
                  >
                    Update GitHub access
                  </SubmitButton>
                </ActionForm>
              }
            />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {repositories.map((repository) => {
                const connectedId = connectedIds.get(repository.githubRepoId);
                return (
                  <li
                    key={repository.githubRepoId}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {repository.fullName}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {repository.isPrivate ? "Private" : "Public"} ·{" "}
                        {repository.defaultBranch}
                      </p>
                    </div>
                    {connectedId ? (
                      <Link
                        href={`/repos/${connectedId}`}
                        className={secondaryButtonClass}
                      >
                        Open
                      </Link>
                    ) : (
                      <ActionForm action={selectRepositoryAction}>
                        <input
                          type="hidden"
                          name="installationUuid"
                          value={selected.id}
                        />
                        <input
                          type="hidden"
                          name="githubRepoId"
                          value={repository.githubRepoId}
                        />
                        <SubmitButton
                          className={buttonClass}
                          pendingText="Connecting…"
                        >
                          Connect
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : activeInstallations.length === 0 ? (
        <EmptyState
          title="No GitHub repository connected"
          hint="Install the GitHub App, choose a repository, and you are ready to analyze."
          action={
            <ActionForm action={connectGithubAction}>
              <SubmitButton
                className={buttonClass}
                pendingText="Opening GitHub…"
              >
                Connect GitHub
              </SubmitButton>
            </ActionForm>
          }
        />
      ) : null}
    </div>
  );
}
