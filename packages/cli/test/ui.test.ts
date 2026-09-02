import { createElement } from "react";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import {
  ChoiceView,
  ErrorView,
  HelpView,
  InitHeaderView,
  ResultView,
} from "../src/ui";

describe("Ink terminal UI", () => {
  it("renders the large Sodium mark without a blank accent row", () => {
    const view = render(createElement(InitHeaderView));

    expect(view.lastFrame()).toContain("█▀▀▀ █▀▀█ █▀▀▄ ▀█▀ █  █ █▄ ▄█");
    expect(view.lastFrame()?.split("\n")).toHaveLength(3);
  });

  it("renders a compact result with one next action and no box", () => {
    const view = render(
      createElement(ResultView, {
        result: {
          command: "deploy",
          title: "Deployment successful",
          details: [
            ["Version", "v3"],
            ["Tools", 5],
          ],
          note: "Dashboard opened in your browser.",
          next: "npx sodiumtools doctor",
        },
      }),
    );

    expect(view.lastFrame()).toContain("◆ SODIUM deploy");
    expect(view.lastFrame()).toContain("✓ Deployment successful");
    expect(view.lastFrame()).toContain("Dashboard opened in your browser.");
    expect(view.lastFrame()).toContain("→ Next: npx sodiumtools doctor");
    expect(view.lastFrame()).not.toContain("╭");
  });

  it("renders the public npx command in help", () => {
    const view = render(createElement(HelpView));

    expect(view.lastFrame()).toContain("npx sodiumtools");
    expect(view.lastFrame()).toContain("open its dashboard");
  });

  it("keeps error symbols and recovery guidance separated", () => {
    const view = render(
      createElement(ErrorView, {
        command: "deploy",
        message: "sodium.json was not found",
      }),
    );

    expect(view.lastFrame()).toContain("× sodium.json was not found");
    expect(view.lastFrame()).toContain(
      "→ Fix this, then run the command again.",
    );
  });

  it("keeps the large init mark out of the completion result", () => {
    const view = render(
      createElement(ResultView, {
        result: {
          command: "init",
          title: "Application is ready",
          tools: [
            { name: "search_docs", risk: "read_only", routes: "/docs/**" },
          ],
        },
      }),
    );

    expect(view.lastFrame()).not.toContain("█▀▀▀");
    expect(view.lastFrame()).not.toContain("◆ SODIUM init");
    expect(view.lastFrame()).toContain("TOOL");
    expect(view.lastFrame()).toContain("search_docs");
    expect(view.lastFrame()).not.toContain("╭");
  });

  it("keeps agent labels and descriptions visibly separated", () => {
    const view = render(
      createElement(ChoiceView, {
        question: "Create sodium.json with a coding agent now?",
        choices: [
          {
            value: "claude",
            label: "Claude Code · detected",
            description: "New terminal · full access",
          },
          {
            value: "gemini",
            label: "Gemini CLI · detected",
            description: "New terminal · full access",
          },
        ],
        onSelect: () => undefined,
      }),
    );

    expect(view.lastFrame()).toContain(
      "Claude Code · detected  New terminal · full access",
    );
    expect(view.lastFrame()).not.toContain("detectedNew");
  });
});
