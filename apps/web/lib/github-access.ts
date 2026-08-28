export interface GitHubInstallationAccount {
  installationId: number;
  accountId: number;
  accountLogin: string;
  accountType: string;
}

type Fetcher = typeof fetch;

interface GitHubViewer {
  id: number;
}

interface GitHubMembership {
  state?: string;
  role?: string;
}

const githubHeaders = (providerToken: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${providerToken}`,
  "X-GitHub-Api-Version": "2022-11-28",
});

async function githubJson<T>(
  path: string,
  providerToken: string,
  fetcher: Fetcher,
): Promise<T> {
  const response = await fetcher(`https://api.github.com${path}`, {
    headers: githubHeaders(providerToken),
  });
  if (!response.ok) throw new Error("GitHub could not verify your account");
  return (await response.json()) as T;
}

async function managesOrganization(
  login: string,
  providerToken: string,
  fetcher: Fetcher,
): Promise<boolean> {
  const response = await fetcher(
    `https://api.github.com/user/memberships/orgs/${encodeURIComponent(login)}`,
    { headers: githubHeaders(providerToken) },
  );
  if (response.status === 403 || response.status === 404) return false;
  if (!response.ok)
    throw new Error("GitHub could not verify organization access");
  const membership = (await response.json()) as GitHubMembership;
  return membership.state === "active" && membership.role === "admin";
}

/**
 * Filters app installations to accounts the OAuth user can manage. The OAuth
 * token is used only for these live GitHub checks and is never persisted.
 */
export async function manageableGithubInstallations(
  installations: GitHubInstallationAccount[],
  providerToken: string,
  fetcher: Fetcher = fetch,
): Promise<GitHubInstallationAccount[]> {
  const viewer = await githubJson<GitHubViewer>(
    "/user",
    providerToken,
    fetcher,
  );

  const decisions = await Promise.all(
    installations.map(async (installation) => {
      if (installation.accountType.toLowerCase() === "user") {
        return installation.accountId === viewer.id;
      }
      if (installation.accountType.toLowerCase() === "organization") {
        return managesOrganization(
          installation.accountLogin,
          providerToken,
          fetcher,
        );
      }
      return false;
    }),
  );

  return installations.filter((_, index) => decisions[index]);
}
