import { createElement } from "react";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { HelpView, ResultView } from "../src/ui";

describe("Ink terminal UI", () => {
  it("renders a compact result card with one next action", () => {
    const view = render(
      createElement(ResultView, {
        result: {
          command: "deploy",
          title: "Deployment is live",
          details: [
            ["Version", "v3"],
            ["Tools", 5],
          ],
          note: "Dashboard opened in your browser.",
          next: "npx sodiumtools doctor",
        },
      }),
    );

    expect(view.lastFrame()).toContain("◆ SODIUM / deploy");
    expect(view.lastFrame()).toContain("Deployment is live");
    expect(view.lastFrame()).toContain("Dashboard opened in your browser.");
    expect(view.lastFrame()).toContain("Next: npx sodiumtools doctor");
  });

  it("renders the public npx command in help", () => {
    const view = render(createElement(HelpView));

    expect(view.lastFrame()).toContain("npx sodiumtools");
    expect(view.lastFrame()).toContain("open its dashboard");
  });
});
