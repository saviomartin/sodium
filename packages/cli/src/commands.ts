import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { basename, dirname, relative } from "node:path";
import clipboard from "clipboardy";
import { SodiumApi, SodiumApiError } from "./api";
import {
  configHash,
  hasSodiumConfig,
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
  type CommandResult,
} from "./output";
import {
  choose,
  isInteractiveTerminal,
  printInfo,
  printResult,
  startProgress,
  type Choice,
  type ProgressHandle,
} from "./ui";

export type AgentChoice = "codex" | "claude" | "gemini" | "other" | "none";

export const AGENT_PROMPT = [
  "Inspect this application and create sodium.json.",
  "First read .agents/skills/sodium-webmcp/SKILL.md and follow it completely.",
  "Ground every tool in real existing UI or API behavior; do not invent capabilities or deploy the project.",
  `Run ${SODIUM_COMMAND} validate, fix every validation error, then summarize the tools you created.`,
].join(" ");

interface RunOptions {
  interactive?: boolean;
}

export interface CommandContext {
  cwd: string;
  interactive: boolean;
  result(result: CommandResult): void;
  info(message: string): void;
  progress(label: string): ProgressHandle;
  choose<T extends string>(question: string, choices: Choice<T>[]): Promise<T>;
  copy(text: string): Promise<boolean>;
  open(url: string): Promise<boolean>;
  hasCommand(command: string): Promise<boolean>;
  run(command: string, args: string[], options?: RunOptions): Promise<void>;
}

function childFailure(command: string, output: string): Error {
  const detail = output.trim().split("\n").slice(-8).join("\n");
  return new Error(
    detail
      ? `${command} failed\n${detail}`
      : `${command} exited unsuccessfully`,
  );
}

export function defaultContext(cwd = process.cwd()): CommandContext {
  const interactive = isInteractiveTerminal();
  return {
    cwd,
    interactive,
    result: printResult,
    info: printInfo,
    progress: startProgress,
    choose,
    async copy(text) {
      try {
        await clipboard.write(text);
        return true;
      } catch {
        return false;
      }
    },
    open(url) {
      return new Promise((resolve) => {
        const command =
          process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
              ? "cmd"
              : "xdg-open";
        const args =
          process.platform === "win32" ? ["/c", "start", "", url] : [url];
        const child = spawn(command, args, { detached: true, stdio: "ignore" });
        child.once("error", () => resolve(false));
        child.once("spawn", () => {
          child.unref();
          resolve(true);
        });
      });
    },
    hasCommand(command) {
      return new Promise((resolve) => {
        const lookup = process.platform === "win32" ? "where" : "which";
        const child = spawn(lookup, [command], { stdio: "ignore" });
        child.once("error", () => resolve(false));
        child.once("exit", (code) => resolve(code === 0));
      });
    },
    run(command, args, options = {}) {
      return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
          cwd,
          stdio: options.interactive ? "inherit" : ["ignore", "pipe", "pipe"],
        });
        let output = "";
        child.stdout?.on("data", (chunk) => {
          output += String(chunk);
        });
        child.stderr?.on("data", (chunk) => {
          output += String(chunk);
        });
        child.once("error", (error) => reject(error));
        child.once("exit", (code) =>
          code === 0 ? resolve() : reject(childFailure(command, output)),
        );
      });
    },
  };
}

async function authenticatedApi(context: CommandContext): Promise<SodiumApi> {
  const saved = await readUserConfig();
  if (saved) {
    const progress = context.progress("Checking your Sodium session");
    const api = new SodiumApi(saved.endpoint, saved.token);
    try {
      await api.me();
      progress.stop();
      return api;
    } catch (error) {
      progress.stop();
      if (!(error instanceof SodiumApiError) || error.status !== 401)
        throw error;
      context.info("Your saved session expired. Starting a new login.");
    }
  }

  const endpoint = process.env.SODIUM_ENDPOINT ?? "https://sodium.result.dev";
  const publicApi = new SodiumApi(endpoint);
  const login = await publicApi.startLogin();
  const opened = await context.open(login.verificationUrl);
  context.info(
    opened
      ? `Browser opened · enter code ${login.userCode}`
      : `Open ${login.verificationUrl} · enter code ${login.userCode}`,
  );
  const progress = context.progress("Waiting for browser authorization");
  const deadline = Date.now() + login.expiresIn * 1000;
  try {
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
  } finally {
    progress.stop();
  }
  throw new Error(`Login expired. Run ${SODIUM_COMMAND} login again.`);
}

export async function loginCommand(context: CommandContext): Promise<void> {
  const api = await authenticatedApi(context);
  const account = await api.me();
  context.result({
    command: "login",
    title: "Account connected",
    details: [
      ["Account", account.email],
      ["Dashboard", dashboardUrl(api.endpoint)],
    ],
    next: `${SODIUM_COMMAND} deploy`,
  });
}

export async function validateCommand(context: CommandContext): Promise<void> {
  const progress = context.progress("Validating sodium.json");
  const config = await readSodiumConfig(context.cwd).finally(() =>
    progress.stop(),
  );
  context.result({
    command: "validate",
    title: "Contract is valid",
    details: [
      ["App", config.app.name],
      ["Tools", config.tools.length],
      ["Origins", config.app.origins.join(", ")],
    ],
    next: `${SODIUM_COMMAND} login`,
  });
}

export async function deployCommand(
  context: CommandContext,
  options: { open?: boolean } = {},
): Promise<void> {
  const [config, framework, sdkInstalled] = await Promise.all([
    readSodiumConfig(context.cwd),
    detectFramework(context.cwd),
    hasSodiumSdk(context.cwd),
  ]);
  if (!sdkInstalled) {
    throw new Error(
      `Sodium is not initialized. Run ${SODIUM_COMMAND} init first.`,
    );
  }
  const api = await authenticatedApi(context);
  const progress = context.progress("Publishing your WebMCP tools");
  try {
    let project;
    try {
      project = await readProject(context.cwd);
      progress.update("Updating the existing Sodium project");
    } catch {
      progress.update("Creating your Sodium project");
      project = await api.createProject(config.app.name);
      await writeProject(context.cwd, project);
    }
    progress.update("Installing the local WebMCP integration");
    const files = await installIntegration(context.cwd, framework);
    progress.update("Publishing an immutable deployment");
    const deployment = await api.deploy(
      project.projectId,
      config,
      configHash(config),
    );
    await writeProject(context.cwd, { ...project, deployment });
    progress.stop();

    const url = dashboardUrl(project.endpoint, project.projectId);
    const shouldOpen = options.open ?? !process.env.CI;
    const opened = shouldOpen ? await context.open(url) : false;
    context.result({
      command: "deploy",
      title: "Deployment is live",
      details: [
        ["Project", `${config.app.name} · ${project.projectId}`],
        ["Version", `v${deployment.version}`],
        ["Tools", config.tools.length],
        ["Integration", `${frameworkName(framework)} · ${files.length} files`],
        ["Dashboard", url],
      ],
      note: opened
        ? "Dashboard opened in your browser."
        : shouldOpen
          ? "The browser could not be opened; use the dashboard URL above."
          : "Browser opening was skipped (--no-open or CI).",
      next: `${SODIUM_COMMAND} doctor`,
    });
  } catch (error) {
    progress.stop();
    throw error;
  }
}

const AGENTS: Record<
  Exclude<AgentChoice, "other" | "none">,
  { command: string; label: string; description: string }
> = {
  codex: {
    command: "codex",
    label: "Codex",
    description: "Open Codex here and let it inspect the application.",
  },
  claude: {
    command: "claude",
    label: "Claude Code",
    description: "Open Claude Code here with safe edit approvals.",
  },
  gemini: {
    command: "gemini",
    label: "Gemini CLI",
    description: "Open Gemini here with automatic edit approval.",
  },
};

async function installedAgentChoices(
  context: CommandContext,
): Promise<Choice<AgentChoice>[]> {
  const installed = await Promise.all(
    (Object.keys(AGENTS) as Array<keyof typeof AGENTS>).map(async (value) => ({
      value,
      available: await context.hasCommand(AGENTS[value].command),
    })),
  );
  return [
    ...installed
      .filter(({ available }) => available)
      .map(({ value }) => ({
        value,
        label: `${AGENTS[value].label} · detected`,
        description: AGENTS[value].description,
      })),
    {
      value: "other" as const,
      label: "Another coding agent",
      description: "Copy a complete prompt for Cursor, Windsurf, or any agent.",
    },
    {
      value: "none" as const,
      label: "Not now",
      description: "Finish init and create sodium.json later.",
    },
  ];
}

async function runAgent(
  context: CommandContext,
  agent: Exclude<AgentChoice, "other" | "none">,
): Promise<void> {
  const available = await context.hasCommand(AGENTS[agent].command);
  if (!available) {
    throw new Error(
      `${AGENTS[agent].label} was not found on this machine. Use --agent other to copy the prompt instead.`,
    );
  }
  context.info(`Opening ${AGENTS[agent].label} in ${context.cwd}`);
  const args = context.interactive
    ? agent === "codex"
      ? [AGENT_PROMPT]
      : agent === "claude"
        ? ["--permission-mode", "acceptEdits", AGENT_PROMPT]
        : ["--approval-mode", "auto_edit", "--prompt-interactive", AGENT_PROMPT]
    : agent === "codex"
      ? [
          "exec",
          "--sandbox",
          "workspace-write",
          "--approve-for-me",
          AGENT_PROMPT,
        ]
      : agent === "claude"
        ? ["--print", "--permission-mode", "acceptEdits", AGENT_PROMPT]
        : ["--approval-mode", "auto_edit", "--prompt", AGENT_PROMPT];
  await context.run(AGENTS[agent].command, args, { interactive: true });
}

export async function initCommand(
  context: CommandContext,
  options: { skipInstall?: boolean; agent?: AgentChoice } = {},
): Promise<void> {
  const progress = context.progress("Inspecting this application");
  let framework;
  let sdkAlreadyInstalled;
  let files;
  try {
    framework = await detectFramework(context.cwd);
    sdkAlreadyInstalled = await hasSodiumSdk(context.cwd);
    if (!options.skipInstall && !sdkAlreadyInstalled) {
      const manager = await detectPackageManager(context.cwd);
      progress.update(`Installing sodium-webmcp-sdk with ${manager}`);
      const args =
        manager === "npm"
          ? ["install", "sodium-webmcp-sdk"]
          : ["add", "sodium-webmcp-sdk"];
      await context.run(manager, args);
    }
    progress.update("Installing the project-local Sodium skill");
    files = await installSkill(context.cwd);
    progress.stop();
  } catch (error) {
    progress.stop();
    throw error;
  }

  const skillDirectory = relative(
    context.cwd,
    files[0] ? dirname(files[0]) : context.cwd,
  );
  const alreadyHasConfig = await hasSodiumConfig(context.cwd);
  let agent = options.agent;
  if (!alreadyHasConfig && !agent && context.interactive) {
    agent = await context.choose(
      "Create sodium.json with a coding agent now?",
      await installedAgentChoices(context),
    );
  }

  let config;
  let promptCopied = false;
  if (!alreadyHasConfig && agent && !["other", "none"].includes(agent)) {
    await runAgent(context, agent as Exclude<AgentChoice, "other" | "none">);
    config = await readSodiumConfig(context.cwd);
  } else if (!alreadyHasConfig && agent === "other") {
    promptCopied = await context.copy(AGENT_PROMPT);
  } else if (alreadyHasConfig) {
    config = await readSodiumConfig(context.cwd);
  }

  const details: Array<[string, string | number]> = [
    ["Project", basename(context.cwd)],
    ["Framework", frameworkName(framework)],
    [
      "SDK",
      sdkAlreadyInstalled
        ? "Already installed"
        : options.skipInstall
          ? "Skipped"
          : "Installed",
    ],
    ["Skill", skillDirectory],
  ];
  if (config) details.push(["Contract", `${config.tools.length} valid tools`]);

  context.result({
    command: "init",
    title: config ? "Application is ready" : "Sodium is initialized",
    details,
    note:
      agent === "other" && !promptCopied
        ? "Clipboard access was unavailable. Copy the prompt shown below."
        : undefined,
    prompt: agent === "other" ? AGENT_PROMPT : undefined,
    promptCopied: agent === "other" ? promptCopied : undefined,
    next: config
      ? `${SODIUM_COMMAND} login`
      : agent === "other"
        ? "Paste the prompt into your coding agent."
        : `Ask your coding agent to use $sodium-webmcp, or rerun with --agent codex|claude|gemini|other.`,
  });
}

export async function doctorCommand(context: CommandContext): Promise<void> {
  const progress = context.progress("Checking the complete Sodium integration");
  try {
    const [config, project, framework] = await Promise.all([
      readSodiumConfig(context.cwd),
      readProject(context.cwd),
      detectFramework(context.cwd),
    ]);
    if (!project.deployment) {
      throw new Error(`No deployment found. Run ${SODIUM_COMMAND} deploy.`);
    }
    if (configHash(config) !== project.deployment.configHash) {
      throw new Error(
        `sodium.json changed after the last deployment. Run ${SODIUM_COMMAND} deploy.`,
      );
    }
    progress.stop();
    context.result({
      command: "doctor",
      title: "Everything is healthy",
      details: [
        ["App", config.app.name],
        ["Project", project.projectId],
        ["Framework", frameworkName(framework)],
        [
          "Deployment",
          `v${project.deployment.version} · ${config.tools.length} tools`,
        ],
        ["Dashboard", dashboardUrl(project.endpoint, project.projectId)],
      ],
      next: "Your app is ready for WebMCP agents.",
    });
  } catch (error) {
    progress.stop();
    throw error;
  }
}
