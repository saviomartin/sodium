import { describe, expect, it, vi } from "vitest";
import {
  manageableGithubInstallations,
  type GitHubInstallationAccount,
} from "../lib/github-access";

const personal: GitHubInstallationAccount = {
  installationId: 1,
  accountId: 42,
  accountLogin: "savio",
  accountType: "User",
};
const organization: GitHubInstallationAccount = {
  installationId: 2,
  accountId: 84,
  accountLogin: "foundative",
  accountType: "Organization",
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("manageableGithubInstallations", () => {
  it("accepts the signed-in user's personal installation", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ id: 42 }));
    await expect(
      manageableGithubInstallations([personal], "token", fetcher),
    ).resolves.toEqual([personal]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("accepts an organization installation only for an active admin", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith("/user")
        ? jsonResponse({ id: 42 })
        : jsonResponse({ state: "active", role: "admin" }),
    );
    await expect(
      manageableGithubInstallations([organization], "token", fetcher),
    ).resolves.toEqual([organization]);
  });

  it("rejects organization members and installations owned by another user", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith("/user")
        ? jsonResponse({ id: 7 })
        : jsonResponse({ state: "active", role: "member" }),
    );
    await expect(
      manageableGithubInstallations([personal, organization], "token", fetcher),
    ).resolves.toEqual([]);
  });

  it("fails closed when GitHub cannot verify organization access", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith("/user")
        ? jsonResponse({ id: 42 })
        : jsonResponse({ message: "unavailable" }, 500),
    );
    await expect(
      manageableGithubInstallations([organization], "token", fetcher),
    ).rejects.toThrow("GitHub could not verify organization access");
  });
});
