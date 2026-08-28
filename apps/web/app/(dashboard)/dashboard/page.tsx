import Link from "next/link";
import { getRepositories, getUserAndOrgs } from "@/lib/queries";
import {
  Card,
  EmptyState,
  buttonClass,
  secondaryButtonClass,
} from "@/components/ui";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { orgs } = await getUserAndOrgs();

  if (orgs.length === 0) {
    return (
      <EmptyState
        title="Create your organization"
        hint="Repositories, analyses and published tools are scoped to an organization."
        action={
          <Link href="/onboarding" className={buttonClass}>
            Start onboarding
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {await Promise.all(
        orgs.map(async (org) => {
          const repos = await getRepositories(org.id);
          return (
            <Card
              key={org.id}
              title={`${org.name} — repositories`}
              actions={
                <Link href="/onboarding" className={secondaryButtonClass}>
                  Connect repository
                </Link>
              }
            >
              {repos.length === 0 ? (
                <EmptyState
                  title="No repositories connected"
                  hint="Install the GitHub App and pick a repository, or use the local fixture repository to try the full flow."
                  action={
                    <Link href="/onboarding" className={buttonClass}>
                      Connect a repository
                    </Link>
                  }
                />
              ) : (
                <ul className="divide-y divide-neutral-100">
                  {repos.map((repo) => (
                    <li
                      key={repo.id}
                      className="flex items-center justify-between gap-4 py-2"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/repos/${repo.id}`}
                          className="text-sm font-medium text-blue-700 hover:underline"
                        >
                          {repo.full_name}
                        </Link>
                        <p className="text-xs text-neutral-500">
                          {repo.github_repo_id === 0
                            ? "local fixture"
                            : "GitHub"}{" "}
                          · default branch{" "}
                          <span className="font-mono">
                            {repo.default_branch}
                          </span>
                        </p>
                      </div>
                      <Link
                        href={`/repos/${repo.id}`}
                        className={secondaryButtonClass}
                      >
                        Open
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        }),
      )}
    </div>
  );
}
