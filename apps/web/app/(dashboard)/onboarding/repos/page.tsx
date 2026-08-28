import { listInstallationRepos } from "@/lib/github";
import { hasGithubApp } from "@/lib/env";
import {
  getInstallations,
  getRepositories,
  getUserAndOrgs,
} from "@/lib/queries";
import { selectRepositoryAction } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, buttonClass } from "@/components/ui";

export const metadata = { title: "Select repository" };

export default async function RepoPickerPage({
  searchParams,
}: {
  searchParams: Promise<{ installation?: string; org?: string }>;
}) {
  const { installation, org: orgParam } = await searchParams;
  const { orgs } = await getUserAndOrgs();
  const org = orgs.find((candidate) => candidate.id === orgParam) ?? orgs[0];
  if (!org) return <EmptyState title="Create an organization first" />;
  if (!hasGithubApp())
    return (
      <EmptyState
        title="GitHub App not configured"
        hint="See README → GitHub App setup."
      />
    );

  const installations = await getInstallations(org.id);
  const installationRow = installations.find(
    (row) => String(row.installation_id) === installation,
  );
  if (!installationRow) {
    return (
      <EmptyState
        title="Installation not found"
        hint="Install the GitHub App from the onboarding page first."
      />
    );
  }

  const [repos, existing] = await Promise.all([
    listInstallationRepos(installationRow.installation_id),
    getRepositories(org.id),
  ]);
  const connectedIds = new Set(existing.map((repo) => repo.github_repo_id));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-lg font-semibold text-balance">
          Select a repository
        </h1>
        <p className="mt-1 text-sm text-neutral-500 text-pretty">
          Repositories the{" "}
          <span className="font-medium">{installationRow.account_login}</span>{" "}
          installation can access. Only Next.js App Router projects are
          supported in this version.
        </p>
      </header>
      <Card>
        {repos.length === 0 ? (
          <EmptyState
            title="No repositories accessible"
            hint="Grant the installation access to at least one repository on GitHub."
          />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {repos.map((repo) => (
              <li
                key={repo.githubRepoId}
                className="flex items-center justify-between gap-4 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {repo.fullName}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {repo.isPrivate ? "private" : "public"} · default{" "}
                    <span className="font-mono">{repo.defaultBranch}</span>
                  </p>
                </div>
                {connectedIds.has(repo.githubRepoId) ? (
                  <span className="text-xs text-neutral-400">connected</span>
                ) : (
                  <ActionForm action={selectRepositoryAction}>
                    <input type="hidden" name="orgId" value={org.id} />
                    <input
                      type="hidden"
                      name="installationUuid"
                      value={installationRow.id}
                    />
                    <input
                      type="hidden"
                      name="githubRepoId"
                      value={repo.githubRepoId}
                    />
                    <input type="hidden" name="owner" value={repo.owner} />
                    <input type="hidden" name="name" value={repo.name} />
                    <input
                      type="hidden"
                      name="fullName"
                      value={repo.fullName}
                    />
                    <input
                      type="hidden"
                      name="defaultBranch"
                      value={repo.defaultBranch}
                    />
                    <input
                      type="hidden"
                      name="isPrivate"
                      value={String(repo.isPrivate)}
                    />
                    <SubmitButton className={buttonClass}>Connect</SubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
