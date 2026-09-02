import { describe, expect, it } from "vitest";
import {
  dashboardUrl,
  frameworkName,
  successMessage,
} from "../src/output";

describe("CLI success output", () => {
  it("formats useful details and a next action", () => {
    expect(
      successMessage(
        "Sodium initialized",
        [
          ["Project", "my-app"],
          ["Framework", "Next.js"],
        ],
        "create sodium.json",
      ),
    ).toBe(
      [
        "✓ Sodium initialized",
        "",
        "  Project    my-app",
        "  Framework  Next.js",
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

  it("uses human-readable framework names", () => {
    expect(frameworkName("next")).toBe("Next.js");
    expect(frameworkName("vite-react")).toBe("React with Vite");
  });
});
