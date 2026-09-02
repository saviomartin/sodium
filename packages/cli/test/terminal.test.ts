import { describe, expect, it } from "vitest";
import { agentShellCommand } from "../src/terminal";

describe("agent terminal command", () => {
  it("quotes the project path, agent arguments, and prompt", () => {
    expect(
      agentShellCommand("/tmp/My project's app", "claude", [
        "--dangerously-skip-permissions",
        "Create John's sodium.json",
      ]),
    ).toBe(
      "cd '/tmp/My project'\\''s app' && exec 'claude' '--dangerously-skip-permissions' 'Create John'\\''s sodium.json'",
    );
  });
});
