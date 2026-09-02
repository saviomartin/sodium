import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { dirname, relative } from "node:path";
import clipboard from "clipboardy";
import { SodiumApi, SodiumApiError } from "./api";
import {
  configHash,
  ensureProjectPlaceholder,
  hasSodiumConfig,
  readInit,
  readProject,
  readSodiumConfig,
  readUserConfig,
  suggestedProjectName,
  writeInit,
  writeProject,
  writeUserConfig,
} from "./files";
import {
  detectAppProfile,
  detectPackageManager,
  hasSodiumSdk,
  installSkill,
  verifySodiumIntegration,
} from "./install";
import { dashboardUrl, SODIUM_COMMAND, type CommandResult } from "./output";
import {
  choose,
  input,
  isInteractiveTerminal,
  printInitHeader,
  printInfo,
  printResult,
  startProgress,
  type Choice,
  type ProgressHandle,
} from "./ui";
import { openAgentTerminal } from "./terminal";

export type AgentChoice = "codex" | "claude" | "gemini" | "other" | "none";

function toolRoutes(
  routes: Array<string | { path: string; when?: string }>,
): string {
  return routes
    .map((route) =>
      typeof route === "string"
        ? route
        : `${route.path}${route.when ? ` when ${route.when}` : ""}`,
    )
    .join(", ");
}

export function agentPrompt(projectName: string): string {
  return [
    `Inspect this browser application and fully install Sodium for the project named ${JSON.stringify(projectName)}.`,
    "First read .agents/skills/sodium-webmcp/SKILL.md and follow it completely.",
    "Create sodium.json, real browser-safe handlers when needed, the framework-native SDK bootstrap, and .sodium/integration.json. Ground every tool in existing UI or API behavior; do not invent capabilities or deploy the project.",
    `Run ${SODIUM_COMMAND} validate and fix every validation or integration error. Summarize the tools and installed files. Your final response must end with this exact standalone sentence: All tools and the browser integration are validated. Next: run ${SODIUM_COMMAND} deploy.`,
  ].join(" ");
}

interface RunOptions {
  interactive?: boolean;
}

export interface CommandContext {
  cwd: string;
  interactive: boolean;
  result(result: CommandResult): void;
  initHeader(): void;
  info(message: string): void;
  progress(label: string): ProgressHandle;
  choose<T extends string>(question: string, choices: Choice<T>[]): Promise<T>;
  input(question: string, placeholder: string): Promise<string>;
  copy(text: string): Promise<boolean>;
  open(url: string): Promise<boolean>;
  hasCommand(command: string): Promise<boolean>;
  launchTerminal(command: string, args: string[]): Promise<boolean>;
  run(command: string, args: string[], options?: RunOptions): Promise<void>;
  runOutput(command: string, args: string[]): Promise<string>;
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
    initHeader: printInitHeader,
    info: printInfo,
    progress: startProgress,
    choose,
    input,
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
    launchTerminal(command, args) {
      return openAgentTerminal(cwd, command, args);
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
    runOutput(command, args) {
      return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
          cwd,
          stdio: ["ignore", "pipe", "pipe"],
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
          code === 0 ? resolve(output) : reject(childFailure(command, output)),
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
      ? `Browser opened · sign in, then approve code ${login.userCode}`
      : `Open ${login.verificationUrl} · sign in, then approve code ${login.userCode}`,
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
  let config;
  let profile;
  let integration;
  try {
    let sdkInstalled;
    [config, profile, sdkInstalled] = await Promise.all([
      readSodiumConfig(context.cwd),
      detectAppProfile(context.cwd),
      hasSodiumSdk(context.cwd),
    ]);
    if (!sdkInstalled) {
      throw new Error(
        `Sodium is not initialized. Run ${SODIUM_COMMAND} init first.`,
      );
    }
    integration = await verifySodiumIntegration(context.cwd);
  } finally {
    progress.stop();
  }
  context.result({
    command: "validate",
    title: "Tools and integration are valid",
    details: [
      ["App", config.app.name],
      ["Tools", config.tools.length],
      ["Origins", config.app.origins.join(", ")],
      ["Application", profile.label],
      [
        "Integration",
        `${integration.files.length} ${integration.files.length === 1 ? "file" : "files"} verified`,
      ],
    ],
    tools: config.tools.map((tool) => ({
      name: tool.name,
      risk: tool.risk,
      routes: toolRoutes(tool.on),
    })),
    next: `${SODIUM_COMMAND} deploy`,
  });
}

export async function deployCommand(
  context: CommandContext,
  options: { open?: boolean } = {},
): Promise<void> {
  const [config, profile, sdkInstalled, initialized] = await Promise.all([
    readSodiumConfig(context.cwd),
    detectAppProfile(context.cwd),
    hasSodiumSdk(context.cwd),
    readInit(context.cwd),
  ]);
  if (!sdkInstalled) {
    throw new Error(
      `Sodium is not initialized. Run ${SODIUM_COMMAND} init first.`,
    );
  }
  const integration = await verifySodiumIntegration(context.cwd);
  const api = await authenticatedApi(context);
  const progress = context.progress("Publishing your WebMCP tools");
  const projectName = initialized?.projectName ?? config.app.name;
  try {
    let project;
    try {
      project = await readProject(context.cwd);
      progress.update("Updating the existing Sodium project");
    } catch {
      progress.update("Creating your Sodium project");
      project = await api.createProject(projectName);
      await writeProject(context.cwd, project);
    }
    progress.update("Publishing an immutable deployment");
    let deployment;
    try {
      deployment = await api.deploy(
        project.projectId,
        config,
        configHash(config),
      );
    } catch (error) {
      if (!(error instanceof SodiumApiError) || error.status !== 404)
        throw error;
      progress.update("Recreating the deleted Sodium project");
      project = await api.createProject(projectName);
      await writeProject(context.cwd, project);
      progress.update("Publishing an immutable deployment");
      deployment = await api.deploy(
        project.projectId,
        config,
        configHash(config),
      );
    }
    await writeProject(context.cwd, { ...project, deployment });
    progress.stop();

    const url = dashboardUrl(project.endpoint, project.projectId);
    const shouldOpen = options.open ?? !process.env.CI;
    const opened = shouldOpen ? await context.open(url) : false;
    context.result({
      command: "deploy",
      title: "Deployment successful",
      details: [
        ["Project", `${projectName} · ${project.projectId}`],
        ["Version", `v${deployment.version}`],
        ["Tools", config.tools.length],
        [
          "Integration",
          `${profile.label} · ${integration.files.length} ${integration.files.length === 1 ? "file" : "files"} verified`,
        ],
        ["Dashboard", url],
      ],
      tools: config.tools.map((tool) => ({
        name: tool.name,
        risk: tool.risk,
        routes: toolRoutes(tool.on),
      })),
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
  {
    command: string;
    label: string;
    description: string;
    color: string;
    args: string[];
  }
> = {
  codex: {
    command: "codex",
    label: "Codex",
    description: "New terminal · full access",
    color: "#10A37F",
    args: ["--dangerously-bypass-approvals-and-sandbox"],
  },
  claude: {
    command: "claude",
    label: "Claude Code",
    description: "New terminal · full access",
    color: "#D97757",
    args: ["--dangerously-skip-permissions"],
  },
  gemini: {
    command: "gemini",
    label: "Gemini CLI",
    description: "New terminal · full access",
    color: "#4285F4",
    args: ["--yolo", "--prompt-interactive"],
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
        color: AGENTS[value].color,
      })),
    {
      value: "other" as const,
      label: "Another coding agent",
      description: "Copy a prompt for another coding agent.",
      color: "#d946ef",
    },
    {
      value: "none" as const,
      label: "Not now",
      description: "Create sodium.json later.",
      color: "#737373",
    },
  ];
}

async function runAgent(
  context: CommandContext,
  agent: Exclude<AgentChoice, "other" | "none">,
  prompt: string,
): Promise<boolean> {
  const available = await context.hasCommand(AGENTS[agent].command);
  if (!available) {
    throw new Error(
      `${AGENTS[agent].label} was not found on this machine. Use --agent other to copy the prompt instead.`,
    );
  }
  context.info(
    `Opening ${AGENTS[agent].label} in a new terminal · full access`,
  );
  return context.launchTerminal(AGENTS[agent].command, [
    ...AGENTS[agent].args,
    prompt,
  ]);
}

export async function initCommand(
  context: CommandContext,
  options: { skipInstall?: boolean; agent?: AgentChoice; name?: string } = {},
): Promise<void> {
  context.initHeader();
  const [savedInit, suggestedName] = await Promise.all([
    readInit(context.cwd),
    suggestedProjectName(context.cwd),
  ]);
  const requestedName = options.name?.trim();
  let projectName = requestedName || savedInit?.projectName;
  if (!projectName && context.interactive) {
    projectName = (
      await context.input(
        "What do you want to name this project?",
        suggestedName,
      )
    ).trim();
  }
  projectName ||= suggestedName;
  await writeInit(context.cwd, { projectName });
  await ensureProjectPlaceholder(context.cwd);

  const progress = context.progress("Inspecting this application");
  let profile;
  let sdkAlreadyInstalled;
  let files;
  try {
    profile = await detectAppProfile(context.cwd);
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

  const skillDirectories = files
    .filter((file) => file.endsWith("SKILL.md"))
    .map((file) => relative(context.cwd, dirname(file)));
  const alreadyHasConfig = await hasSodiumConfig(context.cwd);
  let integrationReady = false;
  if (alreadyHasConfig) {
    try {
      await verifySodiumIntegration(context.cwd);
      integrationReady = true;
    } catch {
      // Existing sodium.json users may still need the agent-authored bootstrap.
    }
  }
  const ready =
    alreadyHasConfig &&
    integrationReady &&
    (sdkAlreadyInstalled || !options.skipInstall);
  let agent = options.agent;
  if (!ready && !agent && context.interactive) {
    agent = await context.choose(
      "Install Sodium with a coding agent now?",
      await installedAgentChoices(context),
    );
  }

  let config;
  let promptCopied = false;
  let agentOpened = false;
  const prompt = agentPrompt(projectName);
  if (!ready && agent && !["other", "none"].includes(agent)) {
    agentOpened = await runAgent(
      context,
      agent as Exclude<AgentChoice, "other" | "none">,
      prompt,
    );
    if (!agentOpened) promptCopied = await context.copy(prompt);
  } else if (!ready && agent === "other") {
    promptCopied = await context.copy(prompt);
  } else if (ready) {
    config = await readSodiumConfig(context.cwd);
  }

  const details: Array<[string, string | number]> = [
    ["Project", projectName],
    [
      "Application",
      profile.recognized ? `${profile.label} · recognized` : profile.label,
    ],
    [
      "SDK",
      sdkAlreadyInstalled
        ? "Already installed"
        : options.skipInstall
          ? "Skipped"
          : "Installed",
    ],
    [
      skillDirectories.length === 1 ? "Skill" : "Skills",
      skillDirectories.join(" · "),
    ],
  ];
  if (config) details.push(["Contract", `${config.tools.length} valid tools`]);
  if (agentOpened && agent && agent in AGENTS) {
    details.push([
      "Agent",
      `${AGENTS[agent as keyof typeof AGENTS].label} · new terminal`,
    ]);
  }

  context.result({
    command: "init",
    title: ready ? "Application is ready" : "Sodium is initialized",
    details,
    note:
      agent === "other" && !promptCopied
        ? "Clipboard access was unavailable. Copy the prompt shown below."
        : undefined,
    prompt:
      agent === "other" ||
      (agent && !["other", "none"].includes(agent) && !agentOpened)
        ? prompt
        : undefined,
    promptCopied:
      agent === "other" ||
      (agent && !["other", "none"].includes(agent) && !agentOpened)
        ? promptCopied
        : undefined,
    next: ready
      ? `${SODIUM_COMMAND} deploy`
      : agentOpened
        ? "Complete the agent chat. It will validate sodium.json and give you the deploy command."
        : agent === "other" || promptCopied
          ? "Paste the prompt into your coding agent."
          : `Ask your coding agent to use $sodium-webmcp, or rerun with --agent codex|claude|gemini|other.`,
  });
}

interface AgentBrowserList {
  success?: boolean;
  data?: { tools?: Array<{ name?: string }> };
}

function parseAgentBrowserTools(output: string): string[] {
  const json = output
    .trim()
    .split("\n")
    .reverse()
    .find((line) => line.trim().startsWith("{"));
  if (!json) throw new Error("agent-browser returned no WebMCP result");
  const result = JSON.parse(json) as AgentBrowserList;
  if (!result.success || !Array.isArray(result.data?.tools)) {
    throw new Error("agent-browser could not inspect WebMCP tools");
  }
  return result.data.tools.flatMap((tool) =>
    typeof tool.name === "string" ? [tool.name] : [],
  );
}

async function liveBrowserSmoke(
  context: CommandContext,
  url: string,
  expectedTools: string[],
): Promise<number> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      "--url must be a valid http:// or https:// application URL",
    );
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(
      "--url must be a valid http:// or https:// application URL",
    );
  }
  if (!(await context.hasCommand("agent-browser"))) {
    throw new Error(
      "Live WebMCP verification requires agent-browser. Install it, then rerun doctor with --url.",
    );
  }
  const help = await context.runOutput("agent-browser", ["--help"]);
  if (!help.includes("webmcp list")) {
    throw new Error(
      "The installed agent-browser does not support WebMCP inspection. Upgrade agent-browser, then rerun doctor with --url.",
    );
  }

  const session = `sodium-doctor-${process.pid}`;
  try {
    await context.runOutput("agent-browser", [
      "--session",
      session,
      "open",
      parsed.toString(),
    ]);
    await context.runOutput("agent-browser", [
      "--session",
      session,
      "wait",
      "500",
    ]);
    const output = await context.runOutput("agent-browser", [
      "--session",
      session,
      "webmcp",
      "list",
      "--json",
    ]);
    const visible = new Set(parseAgentBrowserTools(output));
    const matched = expectedTools.filter((name) => visible.has(name));
    if (matched.length === 0) {
      throw new Error(
        `No Sodium tools registered at ${parsed.toString()}. Use a URL whose route has tools, then rerun doctor.`,
      );
    }
    return matched.length;
  } finally {
    await context
      .runOutput("agent-browser", ["--session", session, "close"])
      .catch(() => undefined);
  }
}

export async function doctorCommand(
  context: CommandContext,
  options: { url?: string } = {},
): Promise<void> {
  const progress = context.progress("Checking the complete Sodium integration");
  try {
    const [config, profile, integration] = await Promise.all([
      readSodiumConfig(context.cwd),
      detectAppProfile(context.cwd),
      verifySodiumIntegration(context.cwd),
    ]);
    let project;
    try {
      project = await readProject(context.cwd);
    } catch {
      throw new Error(`No deployment found. Run ${SODIUM_COMMAND} deploy.`);
    }
    if (!project.deployment) {
      throw new Error(`No deployment found. Run ${SODIUM_COMMAND} deploy.`);
    }
    if (!project.deployment.receipt) {
      throw new Error(
        `The deployment predates signed receipts. Run ${SODIUM_COMMAND} deploy.`,
      );
    }
    if (configHash(config) !== project.deployment.configHash) {
      throw new Error(
        `sodium.json changed after the last deployment. Run ${SODIUM_COMMAND} deploy.`,
      );
    }
    let visibleTools: number | undefined;
    if (options.url) {
      progress.update("Opening the app and checking registered WebMCP tools");
      visibleTools = await liveBrowserSmoke(
        context,
        options.url,
        config.tools.map((tool) => tool.name),
      );
    }
    progress.stop();
    const details: Array<[string, string | number]> = [
      ["App", config.app.name],
      ["Project", project.projectId],
      ["Application", profile.label],
      [
        "Integration",
        `${integration.files.length} ${integration.files.length === 1 ? "file" : "files"} verified`,
      ],
      [
        "Deployment",
        `v${project.deployment.version} · ${config.tools.length} tools`,
      ],
      ["Dashboard", dashboardUrl(project.endpoint, project.projectId)],
    ];
    if (visibleTools !== undefined) {
      details.push([
        "Browser",
        `${visibleTools} ${visibleTools === 1 ? "tool" : "tools"} registered at ${options.url}`,
      ]);
    }
    context.result({
      command: "doctor",
      title: "Everything is healthy",
      details,
      tools: config.tools.map((tool) => ({
        name: tool.name,
        risk: tool.risk,
        routes: toolRoutes(tool.on),
      })),
      note: "Ready for WebMCP agents. Open the ChatGPT desktop app, visit your site, and ask it to complete an action. You’ll see it discover and use the tools above.",
    });
  } catch (error) {
    progress.stop();
    throw error;
  }
}
