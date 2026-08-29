import Link from "next/link";
import { listGithubRepositories } from "@/lib/github";
import { getGithubConnection, getRepositories } from "@/lib/queries";
import { selectRepositoryAction, signInWithGithubAction } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { GithubSignInForm } from "@/components/github-sign-in-form";
import { buttonClass, secondaryButtonClass } from "@/components/ui";

interface HomeRepositoryParams {
  add?: string;
  error?: string;
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
  const [connection, connected] = await Promise.all([
    getGithubConnection(),
    getRepositories(),
  ]);

  if (!connection) {
    return (
      <div className="px-6 py-12 text-center sm:py-16">
        <h2 className="text-base font-semibold">Reconnect GitHub</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-500 text-pretty">
          Sign in once to restore private repository access.
        </p>
        <GithubSignInForm action={signInWithGithubAction} next="/?add=1" />
        {params.error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {params.error}
          </p>
        )}
      </div>
    );
  }

  if (connected.length > 0 && params.add !== "1") {
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

  let repositories: Awaited<ReturnType<typeof listGithubRepositories>> = [];
  let listError = "";
  try {
    repositories = await listGithubRepositories(connection.id);
  } catch {
    listError =
      "GitHub could not load repositories. Sign in with GitHub again.";
  }
  const connectedIds = new Map(
    connected.map((repository) => [repository.github_repo_id, repository.id]),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-sm font-semibold">
            {connection.github_login} repositories
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Select a repository to analyze.
          </p>
        </div>
        {connected.length > 0 && (
          <Link href="/" className={secondaryButtonClass}>
            Done
          </Link>
        )}
      </div>

      {listError ? (
        <div className="px-6 py-8">
          <p role="alert" className="text-sm text-red-700">
            {listError}
          </p>
          <GithubSignInForm action={signInWithGithubAction} next="/?add=1" />
        </div>
      ) : repositories.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-neutral-500">
          No repositories are available to this GitHub account.
        </p>
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
                      name="connectionId"
                      value={connection.id}
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
