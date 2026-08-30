import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  resolveRepositoryHead: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../lib/env", () => ({
  env: {},
  siteUrl: () => "https://sodium.result.dev",
}));
vi.mock("../lib/github", () => ({
  resolveRepositoryHead: mocks.resolveRepositoryHead,
}));
vi.mock("../lib/supabase/service", () => ({
  createServiceClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

import { ensurePaidRepositoryAnalysis } from "../lib/paid-analysis";

describe("ensurePaidRepositoryAnalysis", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.rpc.mockReset();
    mocks.resolveRepositoryHead.mockReset();
  });

  it("resolves the latest commit and idempotently requests paid analysis", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "repo-1",
        owner: "foundative",
        name: "shop",
        default_branch: "main",
        github_connection_id: "connection-1",
      },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    mocks.from.mockReturnValue({ select });
    mocks.resolveRepositoryHead.mockResolvedValue("a".repeat(40));
    mocks.rpc.mockResolvedValue({ data: "run-1", error: null });

    await expect(ensurePaidRepositoryAnalysis("repo-1")).resolves.toBe("run-1");
    expect(mocks.resolveRepositoryHead).toHaveBeenCalledWith(
      "connection-1",
      "foundative",
      "shop",
      "main",
    );
    expect(mocks.rpc).toHaveBeenCalledWith("request_paid_analysis", {
      p_repository_id: "repo-1",
      p_commit_sha: "a".repeat(40),
      p_ref: "main",
    });
  });

  it("fails clearly when the GitHub connection is unavailable", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "repo-1",
        owner: "foundative",
        name: "shop",
        default_branch: "main",
        github_connection_id: null,
      },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    mocks.from.mockReturnValue({ select });

    await expect(ensurePaidRepositoryAnalysis("repo-1")).rejects.toThrow(
      "GitHub connection is unavailable",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
