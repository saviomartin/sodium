import {
  access,
  copyFile,
  mkdir,
  readFile,
  realpath,
  stat,
} from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type AppProfileId =
  | "next-app"
  | "next-pages"
  | "next"
  | "nuxt"
  | "sveltekit"
  | "astro"
  | "angular"
  | "vite-react"
  | "vite"
  | "browser";

export interface AppProfile {
  id: AppProfileId;
  label: string;
  recognized: boolean;
}

export type IntegrationStrategy = "installSodium" | "react-provider";

export interface SodiumIntegration {
  schemaVersion: 1;
  entry: string;
  mount: string;
  strategy: IntegrationStrategy;
  files: string[];
}

export const INTEGRATION_FILE = join(".sodium", "integration.json");

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function hasAny(cwd: string, candidates: string[]): Promise<boolean> {
  return (await Promise.all(candidates.map((file) => exists(join(cwd, file))))).some(
    Boolean,
  );
}

async function packageDependencies(
  cwd: string,
): Promise<Record<string, string>> {
  try {
    const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    return {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.optionalDependencies,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error("package.json is not valid JSON", { cause: error });
  }
}

/** Recognition chooses better agent guidance; it never decides support. */
export async function detectAppProfile(cwd: string): Promise<AppProfile> {
  const dependencies = await packageDependencies(cwd);
  if (dependencies.next) {
    if (
      await hasAny(cwd, [
        "app/layout.tsx",
        "app/layout.jsx",
        "app/layout.js",
        "src/app/layout.tsx",
        "src/app/layout.jsx",
        "src/app/layout.js",
      ])
    ) {
      return { id: "next-app", label: "Next.js · App Router", recognized: true };
    }
    if (
      await hasAny(cwd, [
        "pages/_app.tsx",
        "pages/_app.jsx",
        "pages/_app.js",
        "src/pages/_app.tsx",
        "src/pages/_app.jsx",
        "src/pages/_app.js",
      ])
    ) {
      return {
        id: "next-pages",
        label: "Next.js · Pages Router",
        recognized: true,
      };
    }
    return { id: "next", label: "Next.js", recognized: true };
  }
  if (dependencies.nuxt) return { id: "nuxt", label: "Nuxt", recognized: true };
  if (dependencies["@sveltejs/kit"])
    return { id: "sveltekit", label: "SvelteKit", recognized: true };
  if (dependencies.astro)
    return { id: "astro", label: "Astro", recognized: true };
  if (dependencies["@angular/core"])
    return { id: "angular", label: "Angular", recognized: true };
  if (dependencies.vite && (dependencies.react || dependencies["react-dom"])) {
    return { id: "vite-react", label: "React with Vite", recognized: true };
  }
  if (dependencies.vite)
    return { id: "vite", label: "Vite", recognized: true };
  return { id: "browser", label: "Browser app", recognized: false };
}

export async function hasSodiumSdk(cwd: string): Promise<boolean> {
  const dependencies = await packageDependencies(cwd);
  return Boolean(dependencies["sodium-webmcp-sdk"]);
}

export async function installSkill(cwd: string): Promise<string[]> {
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const sourceRoot = join(packageRoot, "templates", "sodium-webmcp");
  const targetRoots = [join(cwd, ".agents", "skills", "sodium-webmcp")];
  if (await isDirectory(join(cwd, ".claude"))) {
    targetRoots.push(join(cwd, ".claude", "skills", "sodium-webmcp"));
  }
  const files = [
    "SKILL.md",
    join("references", "schema.md"),
    join("references", "integration.md"),
  ];
  for (const targetRoot of targetRoots) {
    for (const file of files) {
      const target = join(targetRoot, file);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(sourceRoot, file), target);
    }
  }
  return targetRoots.flatMap((targetRoot) =>
    files.map((file) => join(targetRoot, file)),
  );
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

function integrationError(detail: string): Error {
  return new Error(
    `Sodium is not mounted in this browser app: ${detail}. Ask your coding agent to use $sodium-webmcp, then rerun npx sodiumtools deploy.`,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function integrationPath(cwd: string, value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw integrationError(`${field} must be a project-relative source file`);
  }
  const candidate = value.trim();
  if (isAbsolute(candidate)) {
    throw integrationError(`${field} must stay inside the project`);
  }
  const absolute = resolve(cwd, candidate);
  const local = relative(resolve(cwd), absolute);
  if (local === ".." || local.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw integrationError(`${field} must stay inside the project`);
  }
  if (!/[cm]?[jt]sx?$/.test(extname(absolute)) &&
      ![".astro", ".svelte", ".vue"].includes(extname(absolute))) {
    throw integrationError(
      `${field} must point to browser source code`,
    );
  }
  return absolute;
}

async function readIntegrationSource(
  cwd: string,
  value: unknown,
  field: string,
): Promise<{ absolute: string; local: string; source: string }> {
  const absolute = integrationPath(cwd, value, field);
  try {
    const [root, target, source] = await Promise.all([
      realpath(cwd),
      realpath(absolute),
      readFile(absolute, "utf8"),
    ]);
    const local = relative(root, target);
    if (local === ".." || local.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
      throw integrationError(`${field} resolves outside the project`);
    }
    return { absolute, local: relative(cwd, absolute), source };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Sodium is not mounted")) {
      throw error;
    }
    throw integrationError(`${String(value)} was not found`);
  }
}

export async function verifySodiumIntegration(
  cwd: string,
): Promise<SodiumIntegration> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(cwd, INTEGRATION_FILE), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw integrationError(`${INTEGRATION_FILE} is missing`);
    }
    throw integrationError(`${INTEGRATION_FILE} is not valid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw integrationError(`${INTEGRATION_FILE} must contain a JSON object`);
  }
  const manifest = parsed as Record<string, unknown>;
  if (manifest.schemaVersion !== 1) {
    throw integrationError(`${INTEGRATION_FILE} must use schemaVersion 1`);
  }
  if (
    manifest.strategy !== "installSodium" &&
    manifest.strategy !== "react-provider"
  ) {
    throw integrationError(
      `${INTEGRATION_FILE} strategy must be installSodium or react-provider`,
    );
  }

  const entry = await readIntegrationSource(cwd, manifest.entry, "entry");
  const mount = await readIntegrationSource(
    cwd,
    manifest.mount ?? manifest.entry,
    "mount",
  );
  const source = `${entry.source}\n${mount.source}`;
  if (!/from\s*["']sodium-webmcp-sdk(?:\/react)?["']/.test(source)) {
    throw integrationError("the SDK import was not found in the declared files");
  }
  if (!source.includes("sodium.json")) {
    throw integrationError("the sodium.json import was not found in the declared files");
  }
  if (!source.includes(".sodium/project.json")) {
    throw integrationError(
      "the .sodium/project.json import was not found in the declared files",
    );
  }
  if (
    manifest.strategy === "installSodium" &&
    !/\binstallSodium\s*\(/.test(source)
  ) {
    throw integrationError("installSodium(...) was not found in the declared files");
  }
  if (
    manifest.strategy === "react-provider" &&
    (!/\bSodiumProvider\b/.test(entry.source) ||
      !/<SodiumProvider\b|createElement\(\s*SodiumProvider\b/.test(entry.source))
  ) {
    throw integrationError("a rendered SodiumProvider was not found in the entry file");
  }
  if (entry.absolute !== mount.absolute) {
    const entryName = entry.local
      .split(/[\\/]/)
      .at(-1)
      ?.replace(/\.[^.]+$/, "")
      .toLowerCase();
    if (!entryName || !mount.source.toLowerCase().includes(entryName)) {
      throw integrationError("the declared mount file does not reference the entry file");
    }
    if (
      manifest.strategy === "react-provider" &&
      !new RegExp(
        `<\\s*${escapeRegExp(entryName)}\\b|createElement\\(\\s*${escapeRegExp(entryName)}\\b`,
        "i",
      ).test(mount.source)
    ) {
      throw integrationError("the declared mount file does not render the entry component");
    }
  }

  return {
    schemaVersion: 1,
    entry: entry.local,
    mount: mount.local,
    strategy: manifest.strategy,
    files: [...new Set([entry.local, mount.local])],
  };
}
