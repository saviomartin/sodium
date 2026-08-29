import Link from "next/link";
import { listInstallationRepos } from "@/lib/github";
import { hasGithubApp } from "@/lib/env";
import { getInstallations, getRepositories } from "@/lib/queries";
import { connectGithubAction, selectRepositoryAction } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { RefreshOnFocus } from "@/components/refresh-on-focus";
import { githubInstallationSettingsUrl } from "@/lib/github-installation-url";
import { buttonClass, cn, CtaArrow, secondaryButtonClass } from "@/components/ui";
import {
  ArrowSquareOutIcon,
  BookBookmarkIcon,
  BuildingsIcon,
  CheckIcon,
  GithubLogoIcon,
  GitBranchIcon,
  GlobeIcon,
  LockSimpleIcon,
  WarningCircleIcon,
  XIcon,
} from "@/components/icons";

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

/** Visibility and default branch, each behind the glyph that names it. */
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
        <CtaArrow />
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
  if (!hasGithubApp()) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="inline-flex items-center gap-1.5 text-sm font-medium">
          <WarningCircleIcon
            aria-hidden
            weight="fill"
            className="size-4 shrink-0 text-amber-300"
          />
          GitHub connection unavailable
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">
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
                  {/* `block`: overflow, and so `truncate`, does not apply to a
                      non-replaced inline box — a long owner/name would spill
                      across the Open button instead of ellipsizing. */}
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

  if (activeInstallations.length === 0) {
    return (
      <div className="px-6 py-12 text-center sm:py-16">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-white/[0.06] text-neutral-300">
          <GithubLogoIcon aria-hidden weight="fill" className="size-5" />
        </div>
        <h2 className="mt-4 text-base font-medium">
          No GitHub repository connected
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-400 text-pretty">
          Install the GitHub App, choose a repository, and you are ready to
          analyze.
        </p>
        <div className="mt-5 flex justify-center">
          <ConnectGithubButton label="Connect a GitHub repo" />
        </div>
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
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <BuildingsIcon
                aria-hidden
                weight="fill"
                className="size-4 text-faint"
              />
              Choose a GitHub account
            </h2>
            <p className="mt-1 text-xs text-neutral-400">
              Select the account that owns the repository.
            </p>
          </div>
          {connected.length > 0 && (
            <Link href="/" className={secondaryButtonClass}>
              <XIcon aria-hidden weight="bold" className="size-4 shrink-0" />
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
              <CtaArrow />
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4 sm:px-6">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <GithubLogoIcon
              aria-hidden
              weight="fill"
              className="size-4 text-faint"
            />
            {selected.account_login} repositories
          </h2>
          <p className="mt-0.5 text-xs text-neutral-400">
            Select one repository to analyze.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {connected.length > 0 && (
            <Link href="/" className={secondaryButtonClass}>
              <CheckIcon
                aria-hidden
                weight="bold"
                className="size-4 shrink-0"
              />
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
            <ArrowSquareOutIcon
              aria-hidden
              weight="bold"
              className="size-4 shrink-0 transition-transform duration-150 group-hover:-translate-y-0.5 motion-reduce:transition-none"
            />
            <span className="sr-only"> on GitHub (opens in a new tab)</span>
          </a>
        </div>
      </div>

      {listError ? (
        <p
          role="alert"
          className="flex items-center gap-1.5 px-6 py-8 text-sm text-red-400"
        >
          <WarningCircleIcon
            aria-hidden
            weight="fill"
            className="size-4 shrink-0"
          />
          {listError}
        </p>
      ) : repositories.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <BookBookmarkIcon aria-hidden className="mx-auto size-6 text-faint" />
          <p className="mt-2 text-sm font-medium">No repositories available</p>
          <p className="mt-1 text-sm text-neutral-400">
            Update GitHub access to grant Sodium one or more repositories.
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
