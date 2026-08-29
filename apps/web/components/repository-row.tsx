import {
  GitBranchIcon,
  GithubMarkIcon,
  GlobeIcon,
  LockSimpleIcon,
} from "./icons";

/**
 * The two lines every repository row shows, shared by the connected list and
 * the GitHub picker so both read as the same object in two states.
 */

/**
 * `owner / name` as text alone, for headings and breadcrumbs that carry their
 * own mark. The separator is dimmed and spaced so the owner reads as a prefix
 * rather than as part of the name; call sites that wrap this in a link carry
 * the undivided `full_name` as the accessible name.
 */
export function RepositoryFullName({ fullName }: { fullName: string }) {
  const slash = fullName.indexOf("/");
  const owner = slash === -1 ? "" : fullName.slice(0, slash);
  const name = slash === -1 ? fullName : fullName.slice(slash + 1);
  return (
    <>
      {owner && (
        <>
          {owner}
          <span className="mx-1.5 text-white/25">/</span>
        </>
      )}
      {name}
    </>
  );
}

/**
 * The same name with the GitHub mark inline, as the repository lists show it.
 */
export function RepositoryName({ fullName }: { fullName: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <GithubMarkIcon aria-hidden className="size-4 shrink-0 text-faint" />
      <span className="truncate">
        <RepositoryFullName fullName={fullName} />
      </span>
    </span>
  );
}

export function RepositoryMeta({
  isPrivate,
  defaultBranch,
}: {
  isPrivate: boolean;
  defaultBranch: string;
}) {
  const VisibilityIcon = isPrivate ? LockSimpleIcon : GlobeIcon;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-xs text-neutral-400">
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
