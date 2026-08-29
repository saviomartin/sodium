import Link from "next/link";
import { listInstallationRepos } from "@/lib/github";
import { hasGithubApp } from "@/lib/env";
import { getInstallations, getRepositories } from "@/lib/queries";
import { connectGithubAction, selectRepositoryAction } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { RefreshOnFocus } from "@/components/refresh-on-focus";
import { githubInstallationSettingsUrl } from "@/lib/github-installation-url";
import { buttonClass, secondaryButtonClass } from "@/components/ui";

const ERROR_MESSAGES: Record<string, string> = {
  github_state: "The GitHub connection expired. Start it again.",
  github_installation: "GitHub could not verify that installation.",
  github_access:
    "Authorize GitHub with an account that owns this installation.",
  github_store: "The GitHub connection could not be saved.",
};

interface HomeRepositoryParams {
  add?: string;
  error?: string;
  installation?: string;
}

function RepositoryMeta({
  isPrivate,
  defaultBranch,
}: {
  isPrivate: boolean;
  defaultBranch: string;
}) {
  return (
    <p className="mt-1 text-xs text-neutral-500">
      {isPrivate ? "Private" : "Public"} · {defaultBranch}
    </p>
  );
}

function ConnectGithubButton({
  label,
  intent = "connect",
  className = buttonClass,
}: {
  label: string;
  intent?: "connect" | "add";
  className?: string;
}) {
  return (
    <ActionForm
      action={connectGithubAction}
      submitEvent={{
        name: "GitHub Connection Started",
        properties: { intent },
      }}
    >
      <input type="hidden" name="intent" value={intent} />
      <SubmitButton className={className} pendingText="Opening GitHub…">
        {label}
      </SubmitButton>
    </ActionForm>
  );
}

export function RepositoryPanelSkeleton() {
  return (
    <div
      aria-label="Loading repositories"
      className="animate-pulse px-6 py-7 motion-reduce:animate-none"
    >
      <div className="h-4 w-40 rounded bg-neutral-200" />
      <div className="mt-5 h-14 rounded-lg bg-neutral-100" />
      <div className="mt-2 h-14 rounded-lg bg-neutral-100" />
    </div>
  );
}

export async function HomeRepositories({
  params,
}: {
  params: HomeRepositoryParams;
}) {
  if (!hasGithubApp()) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm font-semibold">GitHub connection unavailable</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
          This deployment is missing its GitHub App configuration.
        </p>
      </div>
    );
  }

  const [installations, connected] = await Promise.all([
    getInstallations(),
    getRepositories(),
  ]);
  const activeInstallations = installations.filter(
    (installation) => !installation.suspended_at,
  );
  const choosingRepository =
    connected.length === 0 ||
    params.add === "1" ||
    Boolean(params.installation);

  if (!choosingRepository) {
    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-sm font-semibold">Connected repositories</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Open a repository to review tools and publish changes.
            </p>
          </div>
          <Link href="/?add=1" className={buttonClass}>
            New repository
          </Link>
        </div>
        <ul className="divide-y divide-neutral-100 px-2 sm:px-3">
          {connected.map((repository) => (
            <li
              key={repository.id}
              className="flex items-center justify-between gap-4 rounded-lg px-3 py-4"
            >
              <div className="min-w-0">
                <Link
                  href={`/repos/${repository.id}`}
                  className="truncate text-sm font-semibold text-neutral-950 hover:text-blue-700"
                >
                  {repository.full_name}
                </Link>
                <RepositoryMeta
                  isPrivate={repository.is_private}
                  defaultBranch={repository.default_branch}
                />
              </div>
              <Link
                href={`/repos/${repository.id}`}
                className={secondaryButtonClass}
              >
                Open
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (activeInstallations.length === 0) {
    return (
      <div className="px-6 py-12 text-center sm:py-16">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="size-5"
            fill="currentColor"
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
        </div>
        <h2 className="mt-4 text-base font-semibold">
          No GitHub repository connected
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-500 text-pretty">
          Install the GitHub App, choose a repository, and you are ready to
          analyze.
        </p>
        <div className="mt-5 flex justify-center">
          <ConnectGithubButton label="Connect a GitHub repo" />
        </div>
        {params.error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {ERROR_MESSAGES[params.error] ?? "GitHub connection failed."}
          </p>
        )}
      </div>
    );
  }

  const selected =
    activeInstallations.find(
      (installation) =>
        String(installation.installation_id) === params.installation,
    ) ?? (activeInstallations.length === 1 ? activeInstallations[0] : null);

  if (!selected) {
    return (
      <div className="px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Choose a GitHub account</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Select the account that owns the repository.
            </p>
          </div>
          {connected.length > 0 && (
            <Link href="/" className={secondaryButtonClass}>
              Cancel
            </Link>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {activeInstallations.map((installation) => (
            <Link
              key={installation.id}
              href={`/?add=1&installation=${installation.installation_id}`}
              className={secondaryButtonClass}
            >
              {installation.account_login}
            </Link>
          ))}
          <ConnectGithubButton label="Add GitHub account" intent="add" />
        </div>
      </div>
    );
  }

  let repositories: Awaited<ReturnType<typeof listInstallationRepos>> = [];
  let listError = "";
  try {
    repositories = await listInstallationRepos(selected.installation_id);
  } catch {
    listError =
      "GitHub could not load repositories. Update access and try again.";
  }
  const connectedIds = new Map(
    connected.map((repository) => [repository.github_repo_id, repository.id]),
  );
  const updateAccessUrl = githubInstallationSettingsUrl({
    installationId: selected.installation_id,
    accountLogin: selected.account_login,
    accountType: selected.account_type,
  });

  return (
    <div>
      <RefreshOnFocus />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-sm font-semibold">
            {selected.account_login} repositories
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Select one repository to analyze.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {connected.length > 0 && (
            <Link href="/" className={secondaryButtonClass}>
              Done
            </Link>
          )}
          <ConnectGithubButton
            label="Add account"
            intent="add"
            className={secondaryButtonClass}
          />
          <a
            href={updateAccessUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonClass}
          >
            Update access
            <span className="sr-only"> on GitHub (opens in a new tab)</span>
          </a>
        </div>
      </div>

      {listError ? (
        <p role="alert" className="px-6 py-8 text-sm text-red-700">
          {listError}
        </p>
      ) : repositories.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm font-medium">No repositories available</p>
          <p className="mt-1 text-sm text-neutral-500">
            Update GitHub access to grant Sodium one or more repositories.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100 px-2 sm:px-3">
          {repositories.map((repository) => {
            const connectedId = connectedIds.get(repository.githubRepoId);
            return (
              <li
                key={repository.githubRepoId}
                className="flex items-center justify-between gap-4 rounded-lg px-3 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-neutral-950">
                    {repository.fullName}
                  </p>
                  <RepositoryMeta
                    isPrivate={repository.isPrivate}
                    defaultBranch={repository.defaultBranch}
                  />
                </div>
                {connectedId ? (
                  <Link
                    href={`/repos/${connectedId}`}
                    className={secondaryButtonClass}
                  >
                    Open
                  </Link>
                ) : (
                  <ActionForm
                    action={selectRepositoryAction}
                    submitEvent={{
                      name: "Repository Connection Requested",
                      properties: {
                        visibility: repository.isPrivate ? "private" : "public",
                      },
                    }}
                  >
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
    </div>
  );
}
