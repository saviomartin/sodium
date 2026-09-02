import {
  access,
  copyFile,
  readFile,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { dirname, relative, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type Framework = "next" | "vite-react";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function detectFramework(cwd: string): Promise<Framework> {
  const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  if (all.next) return "next";
  if (all.vite && (all.react || all["react-dom"])) return "vite-react";
  throw new Error("supported frameworks are Next.js and React with Vite");
}

export async function hasSodiumSdk(cwd: string): Promise<boolean> {
  const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  return Boolean(
    pkg.dependencies?.["sodium-webmcp-sdk"] ??
      pkg.devDependencies?.["sodium-webmcp-sdk"] ??
      pkg.optionalDependencies?.["sodium-webmcp-sdk"],
  );
}

export async function installSkill(cwd: string): Promise<string[]> {
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const sourceRoot = join(packageRoot, "templates", "sodium-webmcp");
  const targetRoot = join(cwd, ".agents", "skills", "sodium-webmcp");
  const files = ["SKILL.md", join("references", "schema.md")];
  for (const file of files) {
    const target = join(targetRoot, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(sourceRoot, file), target);
  }
  return files.map((file) => join(targetRoot, file));
}

export async function detectPackageManager(
  cwd: string,
): Promise<"pnpm" | "npm" | "yarn" | "bun"> {
  if (await exists(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (
    (await exists(join(cwd, "bun.lockb"))) ||
    (await exists(join(cwd, "bun.lock")))
  )
    return "bun";
  if (await exists(join(cwd, "yarn.lock"))) return "yarn";
  return "npm";
}

function importPath(fromFile: string, toFile: string): string {
  let path = relative(dirname(fromFile), toFile).split(sep).join("/");
  if (!path.startsWith(".")) path = `./${path}`;
  return path.replace(/\.(tsx?|jsx?)$/, "");
}

async function nextLayout(cwd: string): Promise<string> {
  for (const candidate of [
    "app/layout.tsx",
    "src/app/layout.tsx",
    "app/layout.jsx",
    "src/app/layout.jsx",
  ]) {
    const path = join(cwd, candidate);
    if (await exists(path)) return path;
  }
  throw new Error("Next.js root layout was not found");
}

async function viteEntry(cwd: string): Promise<string> {
  for (const candidate of [
    "src/main.tsx",
    "src/main.jsx",
    "src/main.ts",
    "src/main.js",
  ]) {
    const path = join(cwd, candidate);
    if (await exists(path)) return path;
  }
  throw new Error("Vite React entry file was not found");
}

export async function installIntegration(
  cwd: string,
  framework: Framework,
): Promise<string[]> {
  const sodiumDir = join(cwd, "sodium");
  await mkdir(sodiumDir, { recursive: true });
  const handlersPath = join(sodiumDir, "handlers.ts");
  if (!(await exists(handlersPath))) {
    await writeFile(
      handlersPath,
      `import type { SodiumHandlers } from "sodium-webmcp-sdk";\n\nexport const handlers = {} satisfies SodiumHandlers;\n`,
    );
  }

  if (framework === "next") {
    const componentPath = join(sodiumDir, "Sodium.tsx");
    await writeFile(
      componentPath,
      `"use client";\n\nimport config from "../sodium.json";\nimport project from "../.sodium/project.json";\nimport type { SodiumProject } from "sodium-webmcp-sdk";\nimport { SodiumProvider } from "sodium-webmcp-sdk/react";\nimport { handlers } from "./handlers";\n\nexport function Sodium() {\n  return <SodiumProvider config={config} project={project as SodiumProject} handlers={handlers} />;\n}\n`,
    );
    const layoutPath = await nextLayout(cwd);
    let source = await readFile(layoutPath, "utf8");
    if (!source.includes("<Sodium")) {
      const specifier = importPath(layoutPath, componentPath);
      source = `import { Sodium } from "${specifier}";\n${source}`;
      if (!/<body\b[^>]*>/.test(source))
        throw new Error("root layout has no body element");
      source = source.replace(/(<body\b[^>]*>)/, "$1\n        <Sodium />");
      await writeFile(layoutPath, source);
    }
    return [componentPath, handlersPath, layoutPath];
  }

  const entryPath = await viteEntry(cwd);
  let source = await readFile(entryPath, "utf8");
  if (!source.includes("installSodium(")) {
    source = `import config from "../sodium.json";\nimport project from "../.sodium/project.json";\nimport { installSodium, type SodiumProject } from "sodium-webmcp-sdk";\nimport { handlers } from "../sodium/handlers";\n\nvoid installSodium({ config, project: project as SodiumProject, handlers });\n${source}`;
    await writeFile(entryPath, source);
  }
  return [handlersPath, entryPath];
}
