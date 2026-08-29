import { Octokit } from "octokit";
import type { SupabaseClient } from "@supabase/supabase-js";

interface StoredCredentials {
  access_token: string;
}

/** GitHub OAuth access loaded from Supabase Vault for each repository request. */
export class GithubOauthClient {
  constructor(private readonly supabase: SupabaseClient) {}

  private async octokit(connectionId: string): Promise<Octokit> {
    const { data, error } = await this.supabase.rpc(
      "get_github_connection_credentials",
      { p_connection_id: connectionId },
    );
    const credentials = (data as StoredCredentials[] | null)?.[0];
    if (error || !credentials?.access_token) {
      throw new Error("GitHub connection credentials are unavailable");
    }
    return new Octokit({ auth: credentials.access_token });
  }

  /**
   * Downloads one commit as data. Repository code is never executed; no git
   * binary, hooks, or submodules are involved.
   */
  async downloadTarball(
    connectionId: string,
    owner: string,
    repo: string,
    ref: string,
  ): Promise<Uint8Array> {
    const octokit = await this.octokit(connectionId);
    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/tarball/{ref}",
      {
        owner,
        repo,
        ref,
        request: { redirect: "follow" },
      },
    );
    return new Uint8Array(response.data as ArrayBuffer);
  }

  async resolveHeadSha(
    connectionId: string,
    owner: string,
    repo: string,
    ref: string,
  ): Promise<string> {
    const octokit = await this.octokit(connectionId);
    const { data } = await octokit.request(
      "GET /repos/{owner}/{repo}/commits/{ref}",
      { owner, repo, ref },
    );
    return data.sha;
  }
}
