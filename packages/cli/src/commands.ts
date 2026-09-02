import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { basename, relative } from "node:path";
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
  installSkill,
} from "./install";
import {
  dashboardUrl,
  frameworkName,
  SODIUM_COMMAND,
  successMessage,
} from "./output";

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
  context.log(
    successMessage(
      "Logged in to Sodium",
      [
        ["Account", account.email],
        ["Dashboard", dashboardUrl(api.endpoint)],
      ],
      `${SODIUM_COMMAND} deploy`,
    ),
  );
}

export async function validateCommand(context: CommandContext): Promise<void> {
  const config = await readSodiumConfig(context.cwd);
  context.log(
    successMessage(
      "sodium.json is valid",
      [
        ["App", config.app.name],
        ["Tools", config.tools.length],
        ["Origins", config.app.origins.join(", ")],
      ],
      `${SODIUM_COMMAND} login`,
    ),
  );
}

export async function deployCommand(context: CommandContext): Promise<void> {
  const [config, framework, api] = await Promise.all([
    readSodiumConfig(context.cwd),
    detectFramework(context.cwd),
    authenticatedApi(context),
  ]);
  if (!(await hasSodiumSdk(context.cwd))) {
    throw new Error("Sodium is not initialized; run sodium init first");
  }
  let project;
  try {
    project = await readProject(context.cwd);
  } catch {
    project = await api.createProject(config.app.name);
    await writeProject(context.cwd, project);
  }
  const files = await installIntegration(context.cwd, framework);
  const deployment = await api.deploy(
    project.projectId,
    config,
    configHash(config),
  );
  await writeProject(context.cwd, { ...project, deployment });
  context.log(
    successMessage("Deployment ready", [
      ["Project", `${config.app.name} (${project.projectId})`],
      ["Version", deployment.version],
      ["Tools", config.tools.length],
      ["Integration", `${frameworkName(framework)} · ${files.length} files`],
      ["Dashboard", dashboardUrl(project.endpoint, project.projectId)],
    ]),
  );
}

export async function initCommand(
  context: CommandContext,
  options: { skipInstall?: boolean } = {},
): Promise<void> {
  const framework = await detectFramework(context.cwd);
  const sdkAlreadyInstalled = await hasSodiumSdk(context.cwd);
  if (!options.skipInstall && !sdkAlreadyInstalled) {
    const manager = await detectPackageManager(context.cwd);
    const args =
      manager === "npm"
        ? ["install", "sodium-webmcp-sdk"]
        : ["add", "sodium-webmcp-sdk"];
    await context.run(manager, args);
  }
  const files = await installSkill(context.cwd);
  const skillDirectory = relative(
    context.cwd,
    files[0]?.replace(/\/SKILL\.md$/, "") ?? context.cwd,
  );
  context.log(
    successMessage(
      "Sodium initialized",
      [
        ["Project", basename(context.cwd)],
        ["Location", context.cwd],
        ["Framework", frameworkName(framework)],
        [
          "SDK",
          sdkAlreadyInstalled
            ? "Already installed"
            : options.skipInstall
              ? "Skipped (--skip-install)"
              : "Installed",
        ],
        ["Skill", skillDirectory],
      ],
      "ask your coding agent: Use $sodium-webmcp to inspect this app and create sodium.json.",
    ),
  );
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
    successMessage("Project is healthy", [
      ["App", config.app.name],
      ["Project", project.projectId],
      ["Framework", frameworkName(framework)],
      [
        "Deployment",
        `Version ${project.deployment.version} · ${config.tools.length} tools`,
      ],
      ["Dashboard", dashboardUrl(project.endpoint, project.projectId)],
    ]),
  );
}
