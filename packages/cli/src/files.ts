import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import {
  SodiumProjectSchema,
  validateSodiumConfig,
  type SodiumConfig,
  type SodiumProject,
} from "sodium-webmcp-spec";

export const CONFIG_FILE = "sodium.json";
export const PROJECT_FILE = join(".sodium", "project.json");

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
  await writeFile(path, `${JSON.stringify(project, null, 2)}\n`, {
    mode: 0o644,
  });
}

export function configHash(config: SodiumConfig): string {
  return createHash("sha256").update(JSON.stringify(config)).digest("hex");
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
