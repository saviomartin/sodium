import { App, Octokit } from "octokit";
import type { WorkerEnv } from "../env";

/**
 * GitHub App access. Installation IDs are stored; installation tokens are
 * minted on demand (1-hour lifetime), scoped to the target repository and the
 * minimum permissions for the operation, and never persisted.
 */
export class GithubAppClient {
  private readonly app: App;

  constructor(env: WorkerEnv) {
    if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
      throw new Error("GitHub App credentials are not configured");
    }
    this.app = new App({
      appId: env.GITHUB_APP_ID,
      privateKey: env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
    });
  }

  async installationOctokit(installationId: number): Promise<Octokit> {
    return (await this.app.getInstallationOctokit(
      installationId,
    )) as unknown as Octokit;
  }

  /**
   * Downloads the tarball of one commit — repository code is data, never
   * executed; no git binary, no hooks, no submodules.
   */
  async downloadTarball(
    installationId: number,
    owner: string,
    repo: string,
    ref: string,
  ): Promise<Uint8Array> {
    const octokit = await this.installationOctokit(installationId);
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
    installationId: number,
    owner: string,
    repo: string,
    ref: string,
  ): Promise<string> {
    const octokit = await this.installationOctokit(installationId);
    const { data } = await octokit.request(
      "GET /repos/{owner}/{repo}/commits/{ref}",
      { owner, repo, ref },
    );
    return data.sha;
  }
}
