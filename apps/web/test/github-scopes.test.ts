import { describe, expect, it } from "vitest";
import { hasRequiredGithubScopes } from "../lib/github-scopes";

describe("hasRequiredGithubScopes", () => {
  it("accepts the requested private-repository and email scopes", () => {
    expect(hasRequiredGithubScopes(["repo", "user:email"])).toBe(true);
  });

  it("accepts GitHub's broader normalized user scope", () => {
    expect(hasRequiredGithubScopes(["repo", "user"])).toBe(true);
  });

  it.each([[["repo"]], [["user:email"]], [["read:user"]], [[]]])(
    "rejects an incomplete grant: %j",
    (scopes) => {
      expect(hasRequiredGithubScopes(scopes)).toBe(false);
    },
  );
});
