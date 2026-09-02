import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectAppProfile,
  hasSodiumSdk,
  installSkill,
  verifySodiumIntegration,
} from "../src/install";

describe("browser application integration", () => {
  it("installs the project-local skill with integration guidance", async () => {
    const root = await mkdtemp(join(tmpdir(), "sodium-skill-"));
    const files = await installSkill(root);

    expect(files).toHaveLength(3);
    await expect(
      readFile(join(root, ".agents/skills/sodium-webmcp/SKILL.md"), "utf8"),
    ).resolves.toContain("name: sodium-webmcp");
    await expect(
      readFile(
        join(root, ".agents/skills/sodium-webmcp/references/schema.md"),
        "utf8",
      ),
    ).resolves.toContain("# sodium.json v1");
    await expect(
      readFile(
        join(root, ".agents/skills/sodium-webmcp/references/integration.md"),
        "utf8",
      ),
    ).resolves.toContain("# Browser integration");
  });

  it("also installs the full skill for Claude Code when .claude exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "sodium-claude-skill-"));
    await mkdir(join(root, ".claude"));

    const files = await installSkill(root);

    expect(files).toHaveLength(6);
    await expect(
      readFile(
        join(root, ".claude/skills/sodium-webmcp/references/integration.md"),
        "utf8",
      ),
    ).resolves.toContain(".sodium/integration.json");
  });

  it("does not treat a .claude file as a Claude Code directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "sodium-claude-file-"));
    await writeFile(join(root, ".claude"), "not a directory\n");

    await expect(installSkill(root)).resolves.toHaveLength(3);
  });

  it("detects an existing SDK dependency", async () => {
    const root = await mkdtemp(join(tmpdir(), "sodium-dependency-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ dependencies: { "sodium-webmcp-sdk": "^0.1.0" } }),
    );

    await expect(hasSodiumSdk(root)).resolves.toBe(true);
  });

  it.each([
    [{ next: "16" }, "next-app", "app/layout.tsx"],
    [{ next: "16" }, "next-pages", "pages/_app.tsx"],
    [{ nuxt: "4" }, "nuxt", undefined],
    [{ "@sveltejs/kit": "2" }, "sveltekit", undefined],
    [{ astro: "6" }, "astro", undefined],
    [{ "@angular/core": "21" }, "angular", undefined],
    [{ vite: "8", react: "19" }, "vite-react", undefined],
    [{ vite: "8", vue: "3" }, "vite", undefined],
  ] as const)("recognizes popular browser stacks", async (dependencies, id, file) => {
    const root = await mkdtemp(join(tmpdir(), "sodium-profile-"));
    await writeFile(join(root, "package.json"), JSON.stringify({ dependencies }));
    if (file) {
      await mkdir(join(root, file.split("/")[0]!));
      await writeFile(join(root, file), "export default null;\n");
    }

    await expect(detectAppProfile(root)).resolves.toMatchObject({
      id,
      recognized: true,
    });
  });

  it("accepts an unknown browser stack without a framework gate", async () => {
    const root = await mkdtemp(join(tmpdir(), "sodium-generic-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ dependencies: { lit: "3" } }),
    );

    await expect(detectAppProfile(root)).resolves.toEqual({
      id: "browser",
      label: "Browser app",
      recognized: false,
    });
  });

  it("verifies an agent-authored React provider and its real mount", async () => {
    const root = await mkdtemp(join(tmpdir(), "sodium-react-integration-"));
    await mkdir(join(root, ".sodium"));
    await mkdir(join(root, "app"));
    await mkdir(join(root, "sodium"));
    await writeFile(
      join(root, ".sodium/integration.json"),
      JSON.stringify({
        schemaVersion: 1,
        strategy: "react-provider",
        entry: "sodium/Sodium.tsx",
        mount: "app/layout.tsx",
      }),
    );
    await writeFile(
      join(root, "sodium/Sodium.tsx"),
      [
        'import config from "../sodium.json";',
        'import project from "../.sodium/project.json";',
        'import { SodiumProvider } from "sodium-webmcp-sdk/react";',
        "export function Sodium() {",
        "  return <SodiumProvider config={config} project={project} />;",
        "}",
      ].join("\n"),
    );
    await writeFile(
      join(root, "app/layout.tsx"),
      'import { Sodium } from "../sodium/Sodium";\nexport default () => <Sodium />;\n',
    );

    await expect(verifySodiumIntegration(root)).resolves.toMatchObject({
      strategy: "react-provider",
      files: ["sodium/Sodium.tsx", "app/layout.tsx"],
    });
  });

  it("verifies a framework-neutral installSodium bootstrap", async () => {
    const root = await mkdtemp(join(tmpdir(), "sodium-browser-integration-"));
    await mkdir(join(root, ".sodium"));
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, ".sodium/integration.json"),
      JSON.stringify({
        schemaVersion: 1,
        strategy: "installSodium",
        entry: "src/main.ts",
      }),
    );
    await writeFile(
      join(root, "src/main.ts"),
      [
        'import config from "../sodium.json";',
        'import project from "../.sodium/project.json";',
        'import { installSodium } from "sodium-webmcp-sdk";',
        "void installSodium({ config, project });",
      ].join("\n"),
    );

    await expect(verifySodiumIntegration(root)).resolves.toMatchObject({
      strategy: "installSodium",
      entry: "src/main.ts",
      mount: "src/main.ts",
      files: ["src/main.ts"],
    });
  });

  it("accepts a SvelteKit browser layout as the declared mount", async () => {
    const root = await mkdtemp(join(tmpdir(), "sodium-svelte-integration-"));
    await mkdir(join(root, ".sodium"));
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, ".sodium/integration.json"),
      JSON.stringify({
        schemaVersion: 1,
        strategy: "installSodium",
        entry: "src/+layout.svelte",
      }),
    );
    await writeFile(
      join(root, "src/+layout.svelte"),
      [
        "<script>",
        'import { onMount } from "svelte";',
        'import config from "../sodium.json";',
        'import project from "../.sodium/project.json";',
        'import { installSodium } from "sodium-webmcp-sdk";',
        "onMount(() => {",
        "  let dispose = () => {};",
        "  void installSodium({ config, project }).then((handle) => {",
        "    dispose = () => handle.dispose();",
        "  });",
        "  return () => dispose();",
        "});",
        "</script>",
      ].join("\n"),
    );

    await expect(verifySodiumIntegration(root)).resolves.toMatchObject({
      entry: "src/+layout.svelte",
      mount: "src/+layout.svelte",
    });
  });

  it("rejects a receipt that claims a bootstrap without mounting the SDK", async () => {
    const root = await mkdtemp(join(tmpdir(), "sodium-invalid-integration-"));
    await mkdir(join(root, ".sodium"));
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, ".sodium/integration.json"),
      JSON.stringify({
        schemaVersion: 1,
        strategy: "installSodium",
        entry: "src/main.ts",
      }),
    );
    await writeFile(join(root, "src/main.ts"), "console.log('not mounted');\n");

    await expect(verifySodiumIntegration(root)).rejects.toThrow(
      "the SDK import was not found",
    );
  });

  it("rejects integration files outside the application root", async () => {
    const root = await mkdtemp(join(tmpdir(), "sodium-contained-integration-"));
    await mkdir(join(root, ".sodium"));
    await writeFile(
      join(root, ".sodium/integration.json"),
      JSON.stringify({
        schemaVersion: 1,
        strategy: "installSodium",
        entry: "../outside.ts",
      }),
    );

    await expect(verifySodiumIntegration(root)).rejects.toThrow(
      "entry must stay inside the project",
    );
  });

  it("rejects a non-object integration receipt with a useful error", async () => {
    const root = await mkdtemp(join(tmpdir(), "sodium-null-integration-"));
    await mkdir(join(root, ".sodium"));
    await writeFile(join(root, ".sodium/integration.json"), "null\n");

    await expect(verifySodiumIntegration(root)).rejects.toThrow(
      "must contain a JSON object",
    );
  });
});
