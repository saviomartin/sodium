import { createHash } from "node:crypto";
import { access, readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import {
  SodiumProjectSchema,
  compileSodiumConfig,
  validateSodiumConfig,
  type SodiumConfig,
  type SodiumProject,
} from "sodium-webmcp-spec";

export const CONFIG_FILE = "sodium.json";
export const PROJECT_FILE = join(".sodium", "project.json");
export const INIT_FILE = join(".sodium", "init.json");

export interface SodiumInit {
  projectName: string;
}

export async function hasSodiumConfig(cwd: string): Promise<boolean> {
  try {
    await access(join(cwd, CONFIG_FILE));
    return true;
  } catch {
    return false;
  }
}

export async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`${path} was not found`, { cause: error });
    }
    throw new Error(`${path} is not valid JSON`, { cause: error });
  }
}

export async function readSodiumConfig(cwd: string): Promise<SodiumConfig> {
  const path = join(cwd, CONFIG_FILE);
  const result = validateSodiumConfig(await readJson(path));
  if (!result.ok || !result.config) {
    const detail = result.issues
      .map((issue) => `${issue.path ?? "$"}: ${issue.message}`)
      .join("\n");
    throw new Error(`sodium.json is invalid\n${detail}`);
  }
  return result.config;
}

export async function readProject(cwd: string): Promise<SodiumProject> {
  return SodiumProjectSchema.parse(await readJson(join(cwd, PROJECT_FILE)));
}

export async function writeProject(
  cwd: string,
  project: SodiumProject,
): Promise<void> {
  const path = join(cwd, PROJECT_FILE);
  await mkdir(dirname(path), { recursive: true });
  const validated = SodiumProjectSchema.parse(project);
  await writeFile(path, `${JSON.stringify(validated, null, 2)}\n`, {
    mode: 0o644,
  });
}

export async function ensureProjectPlaceholder(cwd: string): Promise<void> {
  const path = join(cwd, PROJECT_FILE);
  try {
    await access(path);
  } catch {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "null\n", { mode: 0o644 });
  }
}

export async function suggestedProjectName(cwd: string): Promise<string> {
  try {
    const pkg = (await readJson(join(cwd, "package.json"))) as {
      name?: unknown;
    };
    if (typeof pkg.name === "string" && pkg.name.trim()) {
      return pkg.name.trim().split("/").at(-1) ?? basename(cwd);
    }
  } catch {
    // A browser app does not need package metadata when --skip-install is used.
  }
  return basename(cwd);
}

export async function readInit(cwd: string): Promise<SodiumInit | null> {
  try {
    const value = (await readJson(join(cwd, INIT_FILE))) as Partial<SodiumInit>;
    if (
      typeof value.projectName === "string" &&
      value.projectName.trim().length > 0 &&
      value.projectName.trim().length <= 120
    ) {
      return { projectName: value.projectName.trim() };
    }
  } catch {
    // First use has no initialization metadata.
  }
  return null;
}

export async function writeInit(cwd: string, value: SodiumInit): Promise<void> {
  const projectName = value.projectName.trim();
  if (!projectName || projectName.length > 120) {
    throw new Error("Project name must be between 1 and 120 characters.");
  }
  const path = join(cwd, INIT_FILE);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ projectName }, null, 2)}\n`, {
    mode: 0o644,
  });
}

export function configHash(config: SodiumConfig): string {
  return createHash("sha256")
    .update(JSON.stringify(compileSodiumConfig(config)))
    .digest("hex");
}

interface UserConfig {
  token: string;
  endpoint: string;
}

function userConfigPath(): string {
  const base =
    process.env.SODIUM_CONFIG_DIR ?? join(homedir(), ".config", "sodium");
  return join(base, "config.json");
}

export async function readUserConfig(): Promise<UserConfig | null> {
  const envToken = process.env.SODIUM_TOKEN;
  const envEndpoint = process.env.SODIUM_ENDPOINT;
  if (envToken)
    return {
      token: envToken,
      endpoint: envEndpoint ?? "https://sodium.result.dev",
    };
  try {
    const value = (await readJson(userConfigPath())) as Partial<UserConfig>;
    if (typeof value.token === "string" && typeof value.endpoint === "string") {
      return { token: value.token, endpoint: value.endpoint };
    }
  } catch {
    // First use has no local credential file.
  }
  return null;
}

export async function writeUserConfig(config: UserConfig): Promise<void> {
  const path = userConfigPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(path, 0o600);
}
