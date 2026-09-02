import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  AGENT_PROMPT,
  initCommand,
  type CommandContext,
} from "../src/commands";

async function nextFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sodium-init-"));
  await mkdir(join(root, "app"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { next: "16" } }),
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
    copy: vi.fn(async () => true),
    open: vi.fn(async () => true),
    hasCommand: vi.fn(async () => false),
    run: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("agent-assisted init", () => {
  it("copies and prints the universal prompt for another agent", async () => {
    const cwd = await nextFixture();
    const context = contextFor(cwd);

    await initCommand(context, { skipInstall: true, agent: "other" });

    expect(context.copy).toHaveBeenCalledWith(AGENT_PROMPT);
    expect(context.result).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "init",
        prompt: AGENT_PROMPT,
        promptCopied: true,
        next: "Paste the prompt into your coding agent.",
      }),
    );
  });

  it("runs an installed agent and validates the file it creates", async () => {
    const cwd = await nextFixture();
    const run = vi.fn(async () => {
      await writeFile(
        join(cwd, "sodium.json"),
        JSON.stringify({
          schemaVersion: 1,
          app: { name: "Fixture", origins: ["https://example.com"] },
          tools: [
            {
              id: "tl_fixture1",
              name: "open_fixture",
              description: "Open the fixture page for the current application.",
              on: ["/**"],
              input: {},
              run: { navigate: "/fixture" },
              risk: "read_only",
            },
          ],
        }),
      );
    });
    const context = contextFor(cwd, {
      hasCommand: vi.fn(async (command) => command === "codex"),
      run,
    });

    await initCommand(context, { skipInstall: true, agent: "codex" });

    expect(run).toHaveBeenCalledWith(
      "codex",
      [
        "exec",
        "--sandbox",
        "workspace-write",
        "--approve-for-me",
        AGENT_PROMPT,
      ],
      { interactive: true },
    );
    expect(context.result).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Application is ready",
        details: expect.arrayContaining([["Contract", "1 valid tools"]]),
      }),
    );
  });
});
