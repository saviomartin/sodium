import "server-only";
import { App } from "octokit";
import { env } from "./env";

export { verifyWebhookSignature } from "./webhook-verify";

let cachedApp: App | null = null;

export function githubApp(): App {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
    throw new Error("GitHub App credentials are not configured");
  }
  cachedApp ??= new App({
    appId: env.GITHUB_APP_ID,
    privateKey: env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
  });
  return cachedApp;
}

export interface InstallationInfo {
  installationId: number;
  accountLogin: string;
  accountType: string;
}

/**
 * The setup callback's installation_id is UNTRUSTED (anyone can hit the URL
 * with an arbitrary id). We authenticate as the app and confirm the
 * installation actually exists for this app before storing it.
 */
export async function verifyInstallation(
  installationId: number,
): Promise<InstallationInfo | null> {
  const app = githubApp();
  try {
    const { data } = await app.octokit.request(
      "GET /app/installations/{installation_id}",
      {
        installation_id: installationId,
      },
    );
    const account = data.account as {
      login?: string;
      slug?: string;
      type?: string;
    } | null;
    return {
      installationId: data.id,
      accountLogin: account?.login ?? account?.slug ?? "unknown",
      accountType: account?.type ?? "User",
    };
  } catch {
    return null;
  }
}

export interface InstallationRepo {
  githubRepoId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
}

export async function listInstallationRepos(
  installationId: number,
): Promise<InstallationRepo[]> {
  const app = githubApp();
  const octokit = await app.getInstallationOctokit(installationId);
  const repos: InstallationRepo[] = [];
  let page = 1;
  for (;;) {
    const { data } = await octokit.request("GET /installation/repositories", {
      per_page: 100,
      page,
    });
    for (const repo of data.repositories) {
      repos.push({
        githubRepoId: Number(repo.id),
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch ?? "main",
        isPrivate: repo.private,
      });
    }
    if (data.repositories.length < 100) break;
    page++;
    if (page > 10) break; // hard cap
  }
  return repos;
}

/** Resolve the current commit on a connected repository's default branch. */
export async function resolveRepositoryHead(
  installationId: number,
  owner: string,
  repo: string,
  ref: string,
): Promise<string> {
  const octokit = await githubApp().getInstallationOctokit(installationId);
  const { data } = await octokit.request(
    "GET /repos/{owner}/{repo}/commits/{ref}",
    { owner, repo, ref },
  );
  return data.sha;
}
