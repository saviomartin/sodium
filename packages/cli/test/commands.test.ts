import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { agentPrompt, initCommand, type CommandContext } from "../src/commands";

async function nextFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sodium-init-"));
  await mkdir(join(root, "app"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "sodium-init-fixture",
      dependencies: { next: "16" },
    }),
  );
  return root;
}

function contextFor(
  cwd: string,
  overrides: Partial<CommandContext> = {},
): CommandContext {
  return {
    cwd,
    interactive: false,
    result: vi.fn(),
    info: vi.fn(),
    progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    choose: vi.fn(async () => "none") as CommandContext["choose"],
    input: vi.fn(async (_question, placeholder) => placeholder),
    copy: vi.fn(async () => true),
    open: vi.fn(async () => true),
    hasCommand: vi.fn(async () => false),
    launchTerminal: vi.fn(async () => true),
    run: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("agent-assisted init", () => {
  it("copies and prints the universal prompt for another agent", async () => {
    const cwd = await nextFixture();
    const context = contextFor(cwd);

    await initCommand(context, { skipInstall: true, agent: "other" });

    const prompt = agentPrompt("sodium-init-fixture");
    expect(context.copy).toHaveBeenCalledWith(prompt);
    expect(context.result).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "init",
        prompt,
        promptCopied: true,
        next: "Paste the prompt into your coding agent.",
      }),
    );
  });

  it("opens an installed agent with full permissions in a new terminal", async () => {
    const cwd = await nextFixture();
    const launchTerminal = vi.fn(async () => true);
    const context = contextFor(cwd, {
      hasCommand: vi.fn(async (command) => command === "codex"),
      launchTerminal,
    });

    await initCommand(context, {
      skipInstall: true,
      agent: "codex",
      name: "Fixture console",
    });

    expect(launchTerminal).toHaveBeenCalledWith("codex", [
      "--dangerously-bypass-approvals-and-sandbox",
      agentPrompt("Fixture console"),
    ]);
    expect(context.result).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Sodium is initialized",
        details: expect.arrayContaining([
          ["Project", "Fixture console"],
          ["Agent", "Codex · new terminal"],
        ]),
      }),
    );
  });

  it.each([
    ["claude", ["--dangerously-skip-permissions"]],
    ["gemini", ["--yolo", "--prompt-interactive"]],
  ] as const)(
    "uses unrestricted %s mode in the new terminal",
    async (agent, flags) => {
      const cwd = await nextFixture();
      const launchTerminal = vi.fn(async () => true);
      const context = contextFor(cwd, {
        hasCommand: vi.fn(
          async (command) =>
            command === (agent === "claude" ? "claude" : "gemini"),
        ),
        launchTerminal,
      });

      await initCommand(context, { skipInstall: true, agent });

      expect(launchTerminal).toHaveBeenCalledWith(
        agent === "claude" ? "claude" : "gemini",
        [...flags, agentPrompt("sodium-init-fixture")],
      );
    },
  );

  it("asks for a project name and uses the package name as its suggestion", async () => {
    const cwd = await nextFixture();
    const context = contextFor(cwd, {
      interactive: true,
      input: vi.fn(async () => "Customer portal"),
    });

    await initCommand(context, { skipInstall: true, agent: "none" });

    expect(context.input).toHaveBeenCalledWith(
      "What do you want to name this project?",
      "sodium-init-fixture",
    );
    expect(context.result).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.arrayContaining([["Project", "Customer portal"]]),
      }),
    );
  });
});
