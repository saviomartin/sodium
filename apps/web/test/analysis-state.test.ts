import { describe, expect, it } from "vitest";
import { shouldEmphasizeRunAnalysis } from "../lib/analysis-state";

const run = (status: string, sha: string) => ({
  status,
  repository_commits: { sha },
});

describe("shouldEmphasizeRunAnalysis", () => {
  it("emphasizes analysis when there is no analysis yet", () => {
    expect(shouldEmphasizeRunAnalysis([])).toBe(true);
    expect(shouldEmphasizeRunAnalysis([run("failed", "a".repeat(40))])).toBe(
      true,
    );
  });

  it("emphasizes analysis when a newer commit was not analyzed successfully", () => {
    expect(
      shouldEmphasizeRunAnalysis([
        run("failed", "b".repeat(40)),
        run("succeeded", "a".repeat(40)),
      ]),
    ).toBe(true);
  });

  it("keeps analysis secondary when the latest commit already succeeded", () => {
    expect(
      shouldEmphasizeRunAnalysis([
        run("failed", "a".repeat(40)),
        run("succeeded", "a".repeat(40)),
      ]),
    ).toBe(false);
    expect(
      shouldEmphasizeRunAnalysis([run("succeeded", "a".repeat(40))]),
    ).toBe(false);
  });
});
