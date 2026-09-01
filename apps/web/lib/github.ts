import "server-only";
import { Octokit } from "octokit";
import { createServiceClient } from "./supabase/service";
import { env, siteUrl } from "./env";
import { hasRequiredGithubScopes } from "./github-scopes";

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
  if (!hasRequiredGithubScopes(scopes)) {
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

/** Confirms that a selected application root is a directory at the branch head. */
export async function verifyRepositoryDirectory(
  connectionId: string,
  owner: string,
  repo: string,
  ref: string,
  path: string,
): Promise<boolean> {
  const octokit = await storedOctokit(connectionId);
  try {
    const { data } = await octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      { owner, repo, path, ref },
    );
    return Array.isArray(data);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 404
    ) {
      return false;
    }
    throw error;
  }
}

const LEGACY_WEBHOOK_HOSTS = new Set(["sodium-webmcp.vercel.app"]);

function isSodiumWebhookUrl(value: unknown, targetUrl: string): boolean {
  if (typeof value !== "string") return false;
  try {
    const candidate = new URL(value);
    const target = new URL(targetUrl);
    return (
      candidate.pathname === "/api/webhooks/github" &&
      (candidate.hostname === target.hostname ||
        LEGACY_WEBHOOK_HOSTS.has(candidate.hostname))
    );
  } catch {
    return false;
  }
}

/** Creates or repairs the push webhook used for continuous analysis. */
export async function createRepositoryWebhook(
  connectionId: string,
  owner: string,
  repo: string,
): Promise<number> {
  if (!env.GITHUB_WEBHOOK_SECRET) {
    throw new Error("GitHub webhook secret is not configured");
  }
  const octokit = await storedOctokit(connectionId);
  const targetUrl = `${siteUrl()}/api/webhooks/github`;
  const { data: hooks } = await octokit.request(
    "GET /repos/{owner}/{repo}/hooks",
    { owner, repo, per_page: 100 },
  );
  const existing = hooks.find(
    (hook) =>
      hook.name === "web" && isSodiumWebhookUrl(hook.config.url, targetUrl),
  );
  if (
    existing &&
    existing.active &&
    existing.events.includes("push") &&
    existing.config.url === targetUrl
  ) {
    return existing.id;
  }
  if (existing) {
    const { data } = await octokit.request(
      "PATCH /repos/{owner}/{repo}/hooks/{hook_id}",
      {
        owner,
        repo,
        hook_id: existing.id,
        active: true,
        events: ["push"],
        config: {
          url: targetUrl,
          content_type: "json",
          secret: env.GITHUB_WEBHOOK_SECRET,
          insecure_ssl: "0",
        },
      },
    );
    return data.id;
  }
  const { data } = await octokit.request("POST /repos/{owner}/{repo}/hooks", {
    owner,
    repo,
    name: "web",
    active: true,
    events: ["push"],
    config: {
      url: targetUrl,
      content_type: "json",
      secret: env.GITHUB_WEBHOOK_SECRET,
      insecure_ssl: "0",
    },
  });
  return data.id;
}
