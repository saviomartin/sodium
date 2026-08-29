import Link from "next/link";
import { listGithubRepositories } from "@/lib/github";
import { getGithubConnection, getRepositories } from "@/lib/queries";
import { selectRepositoryAction, signInWithGithubAction } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { GithubSignInForm } from "@/components/github-sign-in-form";
import {
  buttonClass,
  cn,
  CtaArrow,
  secondaryButtonClass,
} from "@/components/ui";
import {
  BookBookmarkIcon,
  CheckIcon,
  GithubLogoIcon,
  GitBranchIcon,
  GlobeIcon,
  LockSimpleIcon,
  WarningCircleIcon,
} from "@/components/icons";

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
  const VisibilityIcon = isPrivate ? LockSimpleIcon : GlobeIcon;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-400">
      <span className="inline-flex items-center gap-1">
        <VisibilityIcon aria-hidden weight="fill" className="size-3.5" />
        {isPrivate ? "Private" : "Public"}
      </span>
      <span aria-hidden className="text-white/20">
        ·
      </span>
      <span className="inline-flex items-center gap-1 font-mono">
        <GitBranchIcon aria-hidden className="size-3.5" />
        {defaultBranch}
      </span>
    </p>
  );
}

export function RepositoryPanelSkeleton() {
  return (
    <div
      aria-label="Loading repositories"
      className="animate-pulse px-6 py-7 motion-reduce:animate-none"
    >
      <div className="h-4 w-40 rounded bg-white/10" />
      <div className="mt-5 h-14 rounded-lg bg-white/[0.06]" />
      <div className="mt-2 h-14 rounded-lg bg-white/[0.06]" />
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
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-white/[0.06] text-neutral-300">
          <GithubLogoIcon aria-hidden weight="fill" className="size-5" />
        </div>
        <h2 className="mt-4 text-base font-medium">Reconnect GitHub</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-400 text-pretty">
          Sign in once to restore email and private repository access.
        </p>
        <GithubSignInForm action={signInWithGithubAction} next="/?add=1" />
        {params.error && (
          <p
            role="alert"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-red-400"
          >
            <WarningCircleIcon
              aria-hidden
              weight="fill"
              className="size-4 shrink-0"
            />
            {params.error}
          </p>
        )}
      </div>
    );
  }

  if (connected.length > 0 && params.add !== "1") {
    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4 sm:px-6">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <BookBookmarkIcon
                aria-hidden
                weight="fill"
                className="size-4 text-faint"
              />
              Connected repositories
            </h2>
            <p className="mt-0.5 text-xs text-neutral-400">
              Open a repository to review tools and publish changes.
            </p>
          </div>
          <Link href="/?add=1" className={buttonClass}>
            New repository
            <CtaArrow />
          </Link>
        </div>
        <ul className="divide-y divide-white/[0.07] px-2 sm:px-3">
          {connected.map((repository) => (
            <li
              key={repository.id}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-4"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-neutral-300">
                  <GithubLogoIcon
                    aria-hidden
                    weight="fill"
                    className="size-4.5"
                  />
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/repos/${repository.id}`}
                    className="block truncate py-0.5 text-sm font-medium text-neutral-100 hover:text-blue-400"
                  >
                    {repository.full_name}
                  </Link>
                  <RepositoryMeta
                    isPrivate={repository.is_private}
                    defaultBranch={repository.default_branch}
                  />
                </div>
              </div>
              <Link
                href={`/repos/${repository.id}`}
                className={cn(secondaryButtonClass, "shrink-0")}
              >
                Open
                <CtaArrow />
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4 sm:px-6">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <GithubLogoIcon
              aria-hidden
              weight="fill"
              className="size-4 text-faint"
            />
            {connection.github_login} repositories
          </h2>
          <p className="mt-0.5 text-xs text-neutral-400">
            Select one repository to analyze.
          </p>
        </div>
        {connected.length > 0 && (
          <Link href="/" className={secondaryButtonClass}>
            <CheckIcon aria-hidden weight="bold" className="size-4 shrink-0" />
            Done
          </Link>
        )}
      </div>

      {listError ? (
        <div className="px-6 py-8">
          <p
            role="alert"
            className="flex items-center gap-1.5 text-sm text-red-400"
          >
            <WarningCircleIcon
              aria-hidden
              weight="fill"
              className="size-4 shrink-0"
            />
            {listError}
          </p>
          <GithubSignInForm action={signInWithGithubAction} next="/?add=1" />
        </div>
      ) : repositories.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <BookBookmarkIcon aria-hidden className="mx-auto size-6 text-faint" />
          <p className="mt-2 text-sm font-medium">No repositories available</p>
          <p className="mt-1 text-sm text-neutral-400">
            This GitHub account did not return any repositories.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.07] px-2 sm:px-3">
          {repositories.map((repository) => {
            const connectedId = connectedIds.get(repository.githubRepoId);
            return (
              <li
                key={repository.githubRepoId}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-4"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-neutral-300">
                    <BookBookmarkIcon
                      aria-hidden
                      weight="fill"
                      className="size-4.5"
                    />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-100">
                      {repository.fullName}
                    </p>
                    <RepositoryMeta
                      isPrivate={repository.isPrivate}
                      defaultBranch={repository.defaultBranch}
                    />
                  </div>
                </div>
                {connectedId ? (
                  <Link
                    href={`/repos/${connectedId}`}
                    className={cn(secondaryButtonClass, "shrink-0")}
                  >
                    Open
                    <CtaArrow />
                  </Link>
                ) : (
                  <ActionForm
                    className="shrink-0"
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
                      <CtaArrow />
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
