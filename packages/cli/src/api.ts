import type { SodiumConfig, SodiumProject } from "sodium-webmcp-spec";

export class SodiumApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SodiumApiError";
  }
}

export class SodiumApi {
  constructor(
    readonly endpoint: string,
    readonly token?: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(new URL(path, this.endpoint), {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        ...init.headers,
      },
    });
    const body = (await response.json().catch(() => null)) as
      (T & { error?: string }) | null;
    if (!response.ok) {
      throw new SodiumApiError(
        body?.error ?? `Sodium API returned ${response.status}`,
        response.status,
      );
    }
    return body as T;
  }

  startLogin(): Promise<{
    deviceCode: string;
    userCode: string;
    verificationUrl: string;
    expiresIn: number;
    interval: number;
  }> {
    return this.request("/api/cli/auth/start", { method: "POST", body: "{}" });
  }

  pollLogin(
    deviceCode: string,
  ): Promise<{ status: "pending" | "complete"; token?: string }> {
    return this.request("/api/cli/auth/token", {
      method: "POST",
      body: JSON.stringify({ deviceCode }),
    });
  }

  me(): Promise<{ id: string; email: string }> {
    return this.request("/api/cli/me");
  }

  createProject(name: string): Promise<SodiumProject> {
    return this.request("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  deploy(
    projectId: string,
    config: SodiumConfig,
    hash: string,
  ): Promise<{
    id: string;
    version: number;
    configHash: string;
  }> {
    return this.request(`/api/v1/projects/${projectId}/deployments`, {
      method: "POST",
      body: JSON.stringify({ config, configHash: hash }),
    });
  }
}
