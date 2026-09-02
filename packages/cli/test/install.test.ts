import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectFramework,
  hasSodiumSdk,
  installIntegration,
  installSkill,
} from "../src/install";

describe("framework integration", () => {
  it("installs the project-local Sodium skill", async () => {
    const root = await mkdtemp(join(tmpdir(), "sodium-skill-"));
    const files = await installSkill(root);
    expect(files).toHaveLength(2);
    await expect(
      readFile(join(root, ".agents/skills/sodium-webmcp/SKILL.md"), "utf8"),
    ).resolves.toContain("name: sodium-webmcp");
    await expect(
      readFile(
        join(root, ".agents/skills/sodium-webmcp/references/schema.md"),
        "utf8",
      ),
    ).resolves.toContain("# sodium.json v1");
  });

  it("detects an existing SDK dependency before running the package manager", async () => {
    const root = await mkdtemp(join(tmpdir(), "sodium-dependency-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ dependencies: { "sodium-webmcp-sdk": "^0.1.0" } }),
    );
    await expect(hasSodiumSdk(root)).resolves.toBe(true);
  });

  it("installs one provider into a Next.js root layout idempotently", async () => {
    const root = await mkdtemp(join(tmpdir(), "sodium-next-"));
    await mkdir(join(root, "app"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ dependencies: { next: "16" } }),
    );
    await writeFile(
      join(root, "app", "layout.tsx"),
      "export default function Layout({ children }) { return <html><body>{children}</body></html>; }\n",
    );
    expect(await detectFramework(root)).toBe("next");
    await installIntegration(root, "next");
    await installIntegration(root, "next");
    const layout = await readFile(join(root, "app", "layout.tsx"), "utf8");
    const component = await readFile(
      join(root, "sodium", "Sodium.tsx"),
      "utf8",
    );
    expect(layout.match(/<Sodium \/>/g)).toHaveLength(1);
    expect(layout.match(/import \{ Sodium \}/g)).toHaveLength(1);
    expect(component).toContain("project as SodiumProject");
  });

  it("installs once in a Vite entry", async () => {
    const root = await mkdtemp(join(tmpdir(), "sodium-vite-"));
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ devDependencies: { vite: "8", react: "19" } }),
    );
    await writeFile(join(root, "src", "main.tsx"), "console.log('app');\n");
    await installIntegration(root, "vite-react");
    await installIntegration(root, "vite-react");
    const entry = await readFile(join(root, "src", "main.tsx"), "utf8");
    expect(entry.match(/installSodium\(/g)).toHaveLength(1);
    expect(entry).toContain("project: project as SodiumProject");
  });
});
