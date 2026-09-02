import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { SodiumApi, SodiumApiError } from "./api";
import {
  configHash,
  readProject,
  readSodiumConfig,
  readUserConfig,
  writeProject,
  writeUserConfig,
} from "./files";
import {
  detectFramework,
  detectPackageManager,
  hasSodiumSdk,
  installIntegration,
} from "./install";

export interface CommandContext {
  cwd: string;
  log(message: string): void;
  open(url: string): void;
  run(command: string, args: string[]): Promise<void>;
}

export function defaultContext(cwd = process.cwd()): CommandContext {
  return {
    cwd,
    log: console.log,
    open(url) {
      const command =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "cmd"
            : "xdg-open";
      const args =
        process.platform === "win32" ? ["/c", "start", "", url] : [url];
      spawn(command, args, { detached: true, stdio: "ignore" }).unref();
    },
    run(command, args) {
      return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, stdio: "inherit" });
        child.on("exit", (code) =>
          code === 0
            ? resolve()
            : reject(new Error(`${command} exited with ${code}`)),
        );
      });
    },
  };
}

async function authenticatedApi(context: CommandContext): Promise<SodiumApi> {
  const saved = await readUserConfig();
  if (saved) {
    const api = new SodiumApi(saved.endpoint, saved.token);
    try {
      await api.me();
      return api;
    } catch (error) {
      if (!(error instanceof SodiumApiError) || error.status !== 401) throw error;
      context.log("Saved login expired. Authorize Sodium again.");
    }
  }

  const endpoint = process.env.SODIUM_ENDPOINT ?? "https://sodium.result.dev";
  const publicApi = new SodiumApi(endpoint);
  const login = await publicApi.startLogin();
  context.log(`Open ${login.verificationUrl} and enter ${login.userCode}`);
  context.open(login.verificationUrl);
  const deadline = Date.now() + login.expiresIn * 1000;
  while (Date.now() < deadline) {
    await wait(login.interval * 1000);
    const result = await publicApi.pollLogin(login.deviceCode);
    if (result.status === "complete" && result.token) {
      await writeUserConfig({ endpoint, token: result.token });
      const api = new SodiumApi(endpoint, result.token);
      await api.me();
      return api;
    }
  }
  throw new Error("login expired; run sodium login again");
}

export async function loginCommand(context: CommandContext): Promise<void> {
  const api = await authenticatedApi(context);
  const account = await api.me();
  context.log(`Logged in as ${account.email}`);
}

export async function validateCommand(context: CommandContext): Promise<void> {
  const config = await readSodiumConfig(context.cwd);
  context.log(`Valid sodium.json: ${config.tools.length} tools`);
}

export async function deployCommand(context: CommandContext): Promise<void> {
  const [config, project, api] = await Promise.all([
    readSodiumConfig(context.cwd),
    readProject(context.cwd),
    authenticatedApi(context),
  ]);
  const deployment = await api.deploy(
    project.projectId,
    config,
    configHash(config),
  );
  await writeProject(context.cwd, { ...project, deployment });
  context.log(`Deployed version ${deployment.version} (${deployment.id})`);
}

export async function initCommand(
  context: CommandContext,
  options: { skipInstall?: boolean } = {},
): Promise<void> {
  const config = await readSodiumConfig(context.cwd);
  const framework = await detectFramework(context.cwd);
  const api = await authenticatedApi(context);
  let project;
  try {
    project = await readProject(context.cwd);
  } catch {
    project = await api.createProject(config.app.name);
    await writeProject(context.cwd, project);
  }

  if (!options.skipInstall && !(await hasSodiumSdk(context.cwd))) {
    const manager = await detectPackageManager(context.cwd);
    const args =
      manager === "npm"
        ? ["install", "sodium-webmcp-sdk"]
        : ["add", "sodium-webmcp-sdk"];
    await context.run(manager, args);
  }
  const files = await installIntegration(context.cwd, framework);
  const deployment = await api.deploy(
    project.projectId,
    config,
    configHash(config),
  );
  await writeProject(context.cwd, { ...project, deployment });
  context.log(
    `Sodium ready: ${config.tools.length} tools, deployment ${deployment.id}`,
  );
  context.log(`Integrated ${framework} in ${files.length} files`);
}

export async function doctorCommand(context: CommandContext): Promise<void> {
  const [config, project] = await Promise.all([
    readSodiumConfig(context.cwd),
    readProject(context.cwd),
  ]);
  if (!project.deployment)
    throw new Error("no deployment found; run sodium deploy");
  const localHash = configHash(config);
  if (localHash !== project.deployment.configHash) {
    throw new Error(
      "sodium.json changed after the last deployment; run sodium deploy",
    );
  }
  const framework = await detectFramework(context.cwd);
  context.log(
    `Healthy: ${config.tools.length} tools, ${framework}, version ${project.deployment.version}`,
  );
}
