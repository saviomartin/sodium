import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  agentPrompt,
  doctorCommand,
  initCommand,
  validateCommand,
  type CommandContext,
} from "../src/commands";
import { configHash, readSodiumConfig } from "../src/files";

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

async function integratedFixture(): Promise<{ cwd: string }> {
  const cwd = await mkdtemp(join(tmpdir(), "sodium-integrated-"));
  const config = {
    schemaVersion: 1 as const,
    app: { name: "Fixture app", origins: ["https://app.example"] },
    tools: [
      {
        id: "tl_abcdefgh",
        name: "open_product",
        description: "Open one existing product by its stable identifier.",
        input: { id: "string" },
        on: ["/**"],
        run: { navigate: "/products/{id}" },
        risk: "read_only" as const,
      },
    ],
  };
  await mkdir(join(cwd, ".sodium"));
  await mkdir(join(cwd, "src"));
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({
      name: "fixture-app",
      dependencies: { lit: "3", "sodium-webmcp-sdk": "0.1.0" },
    }),
  );
  await writeFile(join(cwd, "sodium.json"), JSON.stringify(config));
  await writeFile(
    join(cwd, ".sodium/integration.json"),
    JSON.stringify({
      schemaVersion: 1,
      strategy: "installSodium",
      entry: "src/main.ts",
    }),
  );
  await writeFile(
    join(cwd, "src/main.ts"),
    [
      'import config from "../sodium.json";',
      'import project from "../.sodium/project.json";',
      'import { installSodium } from "sodium-webmcp-sdk";',
      "void installSodium({ config, project });",
    ].join("\n"),
  );
  return { cwd };
}

function contextFor(
  cwd: string,
  overrides: Partial<CommandContext> = {},
): CommandContext {
  return {
    cwd,
    interactive: false,
    result: vi.fn(),
    initHeader: vi.fn(),
    info: vi.fn(),
    progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    choose: vi.fn(async () => "none") as CommandContext["choose"],
    input: vi.fn(async (_question, placeholder) => placeholder),
    copy: vi.fn(async () => true),
    open: vi.fn(async () => true),
    hasCommand: vi.fn(async () => false),
    launchTerminal: vi.fn(async () => true),
    run: vi.fn(async () => undefined),
    runOutput: vi.fn(async () => ""),
    ...overrides,
  };
}

describe("agent-assisted init", () => {
  it("prints the large Sodium header before doing any init work", async () => {
    const cwd = await nextFixture();
    const calls: string[] = [];
    const context = contextFor(cwd, {
      initHeader: vi.fn(() => calls.push("header")),
      progress: vi.fn(() => {
        calls.push("progress");
        return { update: vi.fn(), stop: vi.fn() };
      }),
    });

    await initCommand(context, { skipInstall: true, agent: "none" });

    expect(calls[0]).toBe("header");
  });

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

  it("initializes an unknown browser stack and creates a build-safe project placeholder", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "sodium-unknown-"));
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({ name: "lit-console", dependencies: { lit: "3" } }),
    );
    const context = contextFor(cwd);

    await initCommand(context, { skipInstall: true, agent: "none" });

    expect(context.result).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.arrayContaining([["Application", "Browser app"]]),
      }),
    );
    await expect(
      readFile(join(cwd, ".sodium/project.json"), "utf8"),
    ).resolves.toBe("null\n");
  });

  it("hands an existing sodium.json without browser wiring back to the coding agent", async () => {
    const { cwd } = await integratedFixture();
    await writeFile(join(cwd, ".sodium/integration.json"), "null\n");
    const context = contextFor(cwd);

    await initCommand(context, {
      skipInstall: true,
      agent: "other",
    });

    expect(context.copy).toHaveBeenCalledWith(
      expect.stringContaining("fully install Sodium"),
    );
    expect(context.result).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Sodium is initialized",
        next: "Paste the prompt into your coding agent.",
      }),
    );
  });
});

describe("integration verification", () => {
  it("validates the contract and framework-neutral browser mount together", async () => {
    const { cwd } = await integratedFixture();
    const context = contextFor(cwd);

    await validateCommand(context);

    expect(context.result).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Tools and integration are valid",
        details: expect.arrayContaining([
          ["Application", "Browser app"],
          ["Integration", "1 file verified"],
        ]),
      }),
    );
  });

  it("uses agent-browser to prove a Sodium tool is registered in the real page", async () => {
    const { cwd } = await integratedFixture();
    await writeFile(
      join(cwd, ".sodium/project.json"),
      JSON.stringify({
        schemaVersion: 1,
        projectId: "prj_abcdefghijkl",
        publishableKey: `sod_pk_${"a".repeat(32)}`,
        endpoint: "https://sodium.result.dev",
        deployment: {
          id: "dep_abcdefghijklmnop",
          version: 3,
          configHash: configHash(await readSodiumConfig(cwd)),
          receipt: {
            algorithm: "Ed25519",
            keyId: "key_test",
            payload: "e30",
            signature: "c2ln",
          },
        },
      }),
    );
    const runOutput = vi.fn(async (_command: string, args: string[]) => {
      if (args.includes("--help")) return "webmcp list";
      if (args.includes("list")) {
        return JSON.stringify({
          success: true,
          data: { tools: [{ name: "open_product" }] },
        });
      }
      return "";
    });
    const context = contextFor(cwd, {
      hasCommand: vi.fn(async (command) => command === "agent-browser"),
      runOutput,
    });

    await doctorCommand(context, { url: "https://app.example/products/1" });

    expect(runOutput).toHaveBeenCalledWith("agent-browser", [
      "--session",
      expect.stringMatching(/^sodium-doctor-/),
      "webmcp",
      "list",
      "--json",
    ]);
    expect(context.result).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.arrayContaining([
          ["Browser", "1 tool registered at https://app.example/products/1"],
        ]),
      }),
    );
  });

  it("turns the local null project placeholder into a clear deploy action", async () => {
    const { cwd } = await integratedFixture();
    await writeFile(join(cwd, ".sodium/project.json"), "null\n");
    const context = contextFor(cwd);

    await expect(doctorCommand(context)).rejects.toThrow(
      "No deployment found. Run npx sodiumtools deploy.",
    );
  });

  it("requires older unsigned deployments to be deployed again", async () => {
    const { cwd } = await integratedFixture();
    await writeFile(
      join(cwd, ".sodium/project.json"),
      JSON.stringify({
        schemaVersion: 1,
        projectId: "prj_abcdefghijkl",
        publishableKey: `sod_pk_${"a".repeat(32)}`,
        endpoint: "https://sodium.result.dev",
        deployment: {
          id: "dep_abcdefghijklmnop",
          version: 1,
          configHash: configHash(await readSodiumConfig(cwd)),
        },
      }),
    );

    await expect(doctorCommand(contextFor(cwd))).rejects.toThrow(
      "The deployment predates signed receipts. Run npx sodiumtools deploy.",
    );
  });
});
