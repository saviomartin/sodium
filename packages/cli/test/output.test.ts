import { describe, expect, it } from "vitest";
import { dashboardUrl, plainResult } from "../src/output";

describe("CLI success output", () => {
  it("formats useful details and a next action", () => {
    expect(
      plainResult({
        command: "init",
        title: "Sodium initialized",
        details: [
          ["Project", "my-app"],
          ["Application", "Next.js"],
        ],
        next: "create sodium.json",
      }),
    ).toBe(
      [
        "✓ Sodium init · Sodium initialized",
        "  Project      my-app",
        "  Application  Next.js",
        "",
        "Next: create sodium.json",
      ].join("\n"),
    );
  });

  it("builds dashboard links for production and local endpoints", () => {
    expect(dashboardUrl("https://sodium.result.dev", "prj_abcdefgh")).toBe(
      "https://sodium.result.dev/projects/prj_abcdefgh",
    );
    expect(dashboardUrl("http://localhost:3000/")).toBe(
      "http://localhost:3000/dashboard",
    );
  });

  it("prints tool rows in deterministic plain output", () => {
    expect(
      plainResult({
        command: "validate",
        title: "Contract is valid",
        tools: [{ name: "search_docs", risk: "read_only", routes: "/docs/**" }],
      }),
    ).toContain("search_docs  read_only  /docs/**");
  });
});
