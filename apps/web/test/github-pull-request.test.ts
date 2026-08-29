import { describe, expect, it } from "vitest";
import { pullRequestStatusUpdate } from "../lib/github-pull-request";

const base = {
  number: 17,
  repository: { id: 42 },
  installation: { id: 84 },
  pull_request: {
    merged: false,
    html_url: "https://github.com/acme/shop/pull/17",
    head: { ref: "sodium/integration-site_123" },
  },
};

describe("pullRequestStatusUpdate", () => {
  it("maps opened and synchronized PRs to open", () => {
    expect(pullRequestStatusUpdate({ ...base, action: "opened" })).toMatchObject({
      githubRepoId: 42,
      installationId: 84,
      prNumber: 17,
      status: "open",
    });
    expect(
      pullRequestStatusUpdate({ ...base, action: "synchronize" })?.status,
    ).toBe("open");
  });

  it("distinguishes merged PRs from closed PRs", () => {
    expect(
      pullRequestStatusUpdate({
        ...base,
        action: "closed",
        pull_request: { ...base.pull_request, merged: true },
      })?.status,
    ).toBe("merged");
    expect(pullRequestStatusUpdate({ ...base, action: "closed" })?.status).toBe(
      "closed",
    );
  });

  it("rejects malformed and irrelevant events", () => {
    expect(pullRequestStatusUpdate({ ...base, action: "labeled" })).toBeNull();
    expect(
      pullRequestStatusUpdate({ ...base, installation: undefined, action: "opened" }),
    ).toBeNull();
  });
});
