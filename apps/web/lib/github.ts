import "server-only";
import { Octokit } from "octokit";
import { createServiceClient } from "./supabase/service";
import { env, siteUrl } from "./env";

export { verifyWebhookSignature } from "./webhook-verify";

export interface GithubIdentity {
  githubUserId: number;
  login: string;
  email: string;
  scopes: string[];
}

export interface GithubRepository {
  githubRepoId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
}

interface StoredCredentials {
  access_token: string;
  refresh_token: string | null;
  github_login: string;
}

/** Verifies the provider token and resolves the user's verified primary email. */
export async function inspectGithubIdentity(
  accessToken: string,
): Promise<GithubIdentity> {
  const octokit = new Octokit({ auth: accessToken });
  const user = await octokit.request("GET /user");
  const emails = await octokit.request("GET /user/emails");
  const primary = emails.data.find((email) => email.primary && email.verified);
  const fallback = emails.data.find((email) => email.verified);
  const scopes = String(user.headers["x-oauth-scopes"] ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  if (!scopes.includes("repo") || !scopes.includes("user:email")) {
    throw new Error("GitHub did not grant private repository and email access");
  }
  return {
    githubUserId: Number(user.data.id),
    login: user.data.login,
    email: primary?.email ?? fallback?.email ?? user.data.email ?? "",
    scopes,
  };
}

async function storedOctokit(connectionId: string): Promise<Octokit> {
  const service = createServiceClient();
  const { data, error } = await service.rpc(
    "get_github_connection_credentials",
    { p_connection_id: connectionId },
  );
  const credentials = (data as StoredCredentials[] | null)?.[0];
  if (error || !credentials?.access_token) {
    throw new Error("GitHub connection credentials are unavailable");
  }
  return new Octokit({ auth: credentials.access_token });
}

export async function listGithubRepositories(
  connectionId: string,
): Promise<GithubRepository[]> {
  const octokit = await storedOctokit(connectionId);
  const repositories: GithubRepository[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data } = await octokit.request("GET /user/repos", {
      affiliation: "owner,collaborator,organization_member",
      sort: "pushed",
      direction: "desc",
      per_page: 100,
      page,
    });
    repositories.push(
      ...data.map((repository) => ({
        githubRepoId: Number(repository.id),
        owner: repository.owner.login,
        name: repository.name,
        fullName: repository.full_name,
        defaultBranch: repository.default_branch ?? "main",
        isPrivate: repository.private,
      })),
    );
    if (data.length < 100) break;
  }
  return repositories;
}

/** Resolve the current commit on a connected repository's default branch. */
export async function resolveRepositoryHead(
  connectionId: string,
  owner: string,
  repo: string,
  ref: string,
): Promise<string> {
  const octokit = await storedOctokit(connectionId);
  const { data } = await octokit.request(
    "GET /repos/{owner}/{repo}/commits/{ref}",
    { owner, repo, ref },
  );
  return data.sha;
}

/** Creates the push webhook used for continuous analysis after connection. */
export async function createRepositoryWebhook(
  connectionId: string,
  owner: string,
  repo: string,
): Promise<number> {
  if (!env.GITHUB_WEBHOOK_SECRET) {
    throw new Error("GitHub webhook secret is not configured");
  }
  const octokit = await storedOctokit(connectionId);
  const { data } = await octokit.request("POST /repos/{owner}/{repo}/hooks", {
    owner,
    repo,
    name: "web",
    active: true,
    events: ["push"],
    config: {
      url: `${siteUrl()}/api/webhooks/github`,
      content_type: "json",
      secret: env.GITHUB_WEBHOOK_SECRET,
      insecure_ssl: "0",
    },
  });
  return data.id;
}
