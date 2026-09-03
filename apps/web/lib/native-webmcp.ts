export interface NativeWebMcpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  };
}

export interface NativeWebMcpTool extends NativeWebMcpToolDefinition {
  execute: (
    input: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>;
}

export interface NativeModelContext {
  registerTool(
    tool: NativeWebMcpTool,
    options?: { signal?: AbortSignal; exposedTo?: string[] },
  ): Promise<void>;
}

export type NativeWebMcpDispatcher = (
  name: string,
  input: Record<string, unknown>,
  options?: { signal?: AbortSignal },
) => Promise<unknown>;

export interface NativeWebMcpBridge {
  version: number;
  setHandler(handler: NativeWebMcpDispatcher): void;
  clearHandler(handler: NativeWebMcpDispatcher): void;
  register(): Promise<void>;
  getStatus(): {
    phase: string;
    registeredCount: number;
    toolCount: number;
    apiSurface: "document" | "navigator" | null;
    errors: string[];
  };
}

declare global {
  interface Document {
    modelContext?: NativeModelContext;
  }

  interface Navigator {
    /** Deprecated WebMCP location retained for compatible browser hosts. */
    modelContext?: NativeModelContext;
  }

  interface Window {
    __sodiumWebMcp?: NativeWebMcpBridge;
  }
}

export interface NativeWebMcpHandlers {
  describeCapabilities(input: Record<string, unknown>): Promise<unknown>;
  getAppState(input: Record<string, unknown>): Promise<unknown>;
  listProjects(input: Record<string, unknown>): Promise<unknown>;
  getProject(input: Record<string, unknown>): Promise<unknown>;
  getTool(input: Record<string, unknown>): Promise<unknown>;
  navigate(input: Record<string, unknown>): Promise<unknown>;
  openProject(input: Record<string, unknown>): Promise<unknown>;
  signIn(input: Record<string, unknown>): Promise<unknown>;
  signOut(input: Record<string, unknown>): Promise<unknown>;
  authorizeCli(input: Record<string, unknown>): Promise<unknown>;
  deleteProject(input: Record<string, unknown>): Promise<unknown>;
  deleteAccount(input: Record<string, unknown>): Promise<unknown>;
}

type NativeWebMcpHandlerName = keyof NativeWebMcpHandlers;
type NativeWebMcpToolBlueprint = NativeWebMcpToolDefinition & {
  handler: NativeWebMcpHandlerName;
};

const emptyInput = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

const projectId = {
  type: "string",
  description: "The Sodium project ID, beginning with prj_.",
  pattern: "^prj_[a-z0-9]{8,24}$",
} as const;

const analyticsDays = {
  type: "integer",
  description: "Analytics window in days. Defaults to 30.",
  enum: [7, 30, 90],
  default: 30,
} as const;

function tool(
  definition: Omit<NativeWebMcpToolBlueprint, "annotations"> & {
    readOnly?: boolean;
    untrustedOutput?: boolean;
  },
): NativeWebMcpToolBlueprint {
  const {
    readOnly = false,
    untrustedOutput = false,
    ...descriptor
  } = definition;
  return {
    ...descriptor,
    annotations: {
      readOnlyHint: readOnly,
      untrustedContentHint: untrustedOutput,
    },
  };
}

const TOOL_BLUEPRINTS: NativeWebMcpToolBlueprint[] = [
  tool({
    name: "sodium_describe_capabilities",
    title: "Describe Sodium site tools",
    description:
      "Lists every WebMCP site tool available in Sodium, including its purpose, inputs, and whether it is read-only. Use when the user asks what this website can do or asks to list its site tools.",
    inputSchema: emptyInput,
    readOnly: true,
    handler: "describeCapabilities",
  }),
  tool({
    name: "sodium_get_app_state",
    title: "Get Sodium app state",
    description:
      "Checks whether the user is signed in and returns the current Sodium page, supported destinations, and project summary.",
    inputSchema: emptyInput,
    readOnly: true,
    untrustedOutput: true,
    handler: "getAppState",
  }),
  tool({
    name: "sodium_list_projects",
    title: "List projects",
    description:
      "Lists every Sodium project visible to the signed-in user, including each live version, deployed tool count, and update time. Use before a project-specific tool when the project ID is unknown.",
    inputSchema: emptyInput,
    readOnly: true,
    untrustedOutput: true,
    handler: "listProjects",
  }),
  tool({
    name: "sodium_get_project",
    title: "Get project dashboard",
    description:
      "Returns one Sodium project's current deployment, deployed tools, deployment history, and agent analytics without changing the visible page.",
    inputSchema: {
      type: "object",
      properties: { projectId, days: analyticsDays },
      required: ["projectId"],
      additionalProperties: false,
    },
    readOnly: true,
    untrustedOutput: true,
    handler: "getProject",
  }),
  tool({
    name: "sodium_get_deployed_tool",
    title: "Get deployed tool",
    description:
      "Returns the complete live contract, routes, risk policy, and analytics for one deployed WebMCP tool in a Sodium project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId,
        toolName: {
          type: "string",
          description: "The exact deployed WebMCP tool name.",
          minLength: 1,
          maxLength: 128,
        },
        days: analyticsDays,
      },
      required: ["projectId", "toolName"],
      additionalProperties: false,
    },
    readOnly: true,
    untrustedOutput: true,
    handler: "getTool",
  }),
  tool({
    name: "sodium_navigate",
    title: "Navigate Sodium",
    description:
      "Opens the Sodium home page, account settings, or CLI activation page in the current browser tab.",
    inputSchema: {
      type: "object",
      properties: {
        destination: {
          type: "string",
          enum: ["home", "settings", "activate_cli"],
        },
        code: {
          type: "string",
          description:
            "Optional CLI user code for activate_cli, formatted as four alphanumeric characters, a hyphen, then four more.",
          pattern: "^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$",
        },
      },
      required: ["destination"],
      additionalProperties: false,
    },
    handler: "navigate",
  }),
  tool({
    name: "sodium_open_project",
    title: "Open project",
    description:
      "Opens a Sodium project dashboard in the visible page and selects its 7, 30, or 90 day analytics range.",
    inputSchema: {
      type: "object",
      properties: { projectId, days: analyticsDays },
      required: ["projectId"],
      additionalProperties: false,
    },
    handler: "openProject",
  }),
  tool({
    name: "sodium_sign_in",
    title: "Sign in",
    description:
      "Starts Sodium sign-in with GitHub or Google in the current tab. The user must complete authentication directly with that provider.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", enum: ["github", "google"] },
        nextPath: {
          type: "string",
          description:
            "Optional same-origin Sodium path to return to after sign-in. Defaults to the current page.",
          minLength: 1,
          maxLength: 500,
        },
      },
      required: ["provider"],
      additionalProperties: false,
    },
    handler: "signIn",
  }),
  tool({
    name: "sodium_sign_out",
    title: "Sign out",
    description:
      "Signs the user out of this Sodium browser session. Only call after the user explicitly asks to sign out.",
    inputSchema: {
      type: "object",
      properties: {
        confirmed: {
          type: "boolean",
          const: true,
          description: "True only after the user explicitly requests sign-out.",
        },
      },
      required: ["confirmed"],
      additionalProperties: false,
    },
    handler: "signOut",
  }),
  tool({
    name: "sodium_authorize_cli",
    title: "Authorize Sodium CLI",
    description:
      "SECURITY-SENSITIVE: authorizes one pending Sodium CLI device code for the signed-in account. Only call after the user confirms the exact same code is visible in their own terminal.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "The exact code visible in the user's terminal.",
          pattern: "^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$",
        },
        confirmed: {
          type: "boolean",
          const: true,
          description:
            "True only after the user confirms this code matches their terminal.",
        },
      },
      required: ["code", "confirmed"],
      additionalProperties: false,
    },
    handler: "authorizeCli",
  }),
  tool({
    name: "sodium_delete_project",
    title: "Delete project",
    description:
      "DESTRUCTIVE: permanently deletes one Sodium project, all its deployments, and all its analytics. It does not alter the application repository. Requires the exact current project name as confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        projectId,
        confirmation: {
          type: "string",
          description: "The project's exact current name.",
          minLength: 1,
          maxLength: 120,
        },
      },
      required: ["projectId", "confirmation"],
      additionalProperties: false,
    },
    handler: "deleteProject",
  }),
  tool({
    name: "sodium_delete_account",
    title: "Delete account",
    description:
      "DESTRUCTIVE: permanently deletes the signed-in Sodium identity, projects, deployments, CLI tokens, and analytics. It does not alter application repositories. Only call after explicit user confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        confirmation: {
          type: "string",
          const: "delete",
          description: 'Must be exactly "delete" after explicit confirmation.',
        },
      },
      required: ["confirmation"],
      additionalProperties: false,
    },
    handler: "deleteAccount",
  }),
];

export const NATIVE_WEBMCP_TOOL_DEFINITIONS: NativeWebMcpToolDefinition[] =
  TOOL_BLUEPRINTS.map((blueprint) => ({
    name: blueprint.name,
    title: blueprint.title,
    description: blueprint.description,
    inputSchema: blueprint.inputSchema,
    annotations: blueprint.annotations,
  }));

export function describeNativeWebMcpCapabilities() {
  return {
    ok: true,
    standard: "WebMCP",
    toolCount: NATIVE_WEBMCP_TOOL_DEFINITIONS.length,
    tools: NATIVE_WEBMCP_TOOL_DEFINITIONS.map((definition) => ({
      name: definition.name,
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema,
      readOnly: definition.annotations.readOnlyHint,
      outputContainsUntrustedContent:
        definition.annotations.untrustedContentHint,
    })),
  };
}

/**
 * The app's first-party, browser-native WebMCP contract. This deliberately has
 * no Sodium runtime dependency: the product itself remains usable even when no
 * customer contract has been loaded.
 */
export function createNativeWebMcpTools(
  handlers: NativeWebMcpHandlers,
): NativeWebMcpTool[] {
  return TOOL_BLUEPRINTS.map(({ handler, ...definition }) => ({
    ...definition,
    execute: handlers[handler],
  }));
}

export function createNativeWebMcpDispatcher(
  handlers: NativeWebMcpHandlers,
): NativeWebMcpDispatcher {
  const tools = new Map(
    createNativeWebMcpTools(handlers).map((definition) => [
      definition.name,
      definition.execute,
    ]),
  );
  return async (name, input, options) => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return { ok: false, error: "invalid_input" };
    }
    const execute = tools.get(name);
    if (!execute) return { ok: false, error: "tool_not_found" };
    if (options?.signal?.aborted) {
      throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
    }
    return execute(input, options);
  };
}

export function getNativeModelContext(
  targetDocument: Pick<Document, "modelContext"> = document,
  targetNavigator: Pick<Navigator, "modelContext"> = navigator,
): NativeModelContext | undefined {
  return targetDocument.modelContext ?? targetNavigator.modelContext;
}

export async function registerNativeWebMcpTools(
  modelContext: NativeModelContext,
  tools: NativeWebMcpTool[],
  signal: AbortSignal,
): Promise<void> {
  const registrations = await Promise.allSettled(
    tools.map((definition) =>
      modelContext.registerTool(definition, { signal }),
    ),
  );
  const failure = registrations.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failure && !signal.aborted) throw failure.reason;
}

function jsonForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

/**
 * Registers stable tool descriptors before React hydration. The bridge retries
 * when a browser injects WebMCP late and supports the deprecated navigator
 * location without installing a polyfill or any Sodium runtime.
 */
export function nativeWebMcpBootstrapScript(): string {
  const definitions = jsonForInlineScript(NATIVE_WEBMCP_TOOL_DEFINITIONS);
  const capabilities = jsonForInlineScript(describeNativeWebMcpCapabilities());
  return `(() => {
  const existing = window.__sodiumWebMcp;
  if (existing && existing.version >= 2) {
    void existing.register();
    return;
  }
  const definitions = ${definitions};
  const capabilities = ${capabilities};
  const registered = new Set();
  const waiters = new Set();
  const controller = new AbortController();
  const state = {
    phase: "waiting_for_browser",
    apiSurface: null,
    errors: [],
    handler: null,
    modelContext: null,
    registrationPromise: null,
  };
  const status = () => ({
    phase: state.phase,
    registeredCount: registered.size,
    toolCount: definitions.length,
    apiSurface: state.apiSurface,
    errors: state.errors.slice(),
  });
  const emitStatus = () => {
    window.dispatchEvent(new CustomEvent("sodium:webmcp-status", { detail: status() }));
  };
  const resolveModelContext = () => {
    if (document.modelContext && typeof document.modelContext.registerTool === "function") {
      state.apiSurface = "document";
      return document.modelContext;
    }
    if (navigator.modelContext && typeof navigator.modelContext.registerTool === "function") {
      state.apiSurface = "navigator";
      return navigator.modelContext;
    }
    state.apiSurface = null;
    return null;
  };
  const waitForHandler = (signal) => {
    if (state.handler) return Promise.resolve(state.handler);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (handler) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        waiters.delete(finish);
        resolve(handler);
      };
      const abort = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        waiters.delete(finish);
        reject(signal.reason || new DOMException("Aborted", "AbortError"));
      };
      const timeout = setTimeout(() => finish(null), 30000);
      waiters.add(finish);
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    });
  };
  const invoke = async (name, input, options) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return { ok: false, error: "invalid_input" };
    }
    if (name === "sodium_describe_capabilities") return capabilities;
    const handler = await waitForHandler(options?.signal);
    if (!handler) return { ok: false, error: "tool_not_ready", retryable: true };
    return handler(name, input || {}, options || {});
  };
  const register = async () => {
    if (registered.size === definitions.length) return;
    if (state.registrationPromise) return state.registrationPromise;
    const modelContext = resolveModelContext();
    if (!modelContext) {
      state.phase = "waiting_for_browser";
      emitStatus();
      return;
    }
    if (state.modelContext && state.modelContext !== modelContext) {
      registered.clear();
      state.errors = [];
    }
    state.modelContext = modelContext;
    state.phase = "registering";
    emitStatus();
    state.registrationPromise = Promise.all(definitions.map(async (definition) => {
      if (registered.has(definition.name)) return;
      try {
        await modelContext.registerTool({
          ...definition,
          execute: (input, options) => invoke(definition.name, input, options),
        }, { signal: controller.signal });
        registered.add(definition.name);
        state.errors = state.errors.filter((message) => !message.startsWith(definition.name + ": "));
      } catch (error) {
        const message = definition.name + ": " + (error instanceof Error ? error.message : String(error));
        if (!state.errors.includes(message)) state.errors.push(message);
      }
    })).finally(() => {
      state.registrationPromise = null;
      state.phase = registered.size === definitions.length ? "ready" : "registration_failed";
      emitStatus();
    });
    return state.registrationPromise;
  };
  const bridge = {
    version: 2,
    setHandler(handler) {
      state.handler = handler;
      for (const finish of waiters) finish(handler);
      waiters.clear();
    },
    clearHandler(handler) {
      if (state.handler === handler) state.handler = null;
    },
    register,
    getStatus: status,
  };
  window.__sodiumWebMcp = bridge;
  void register();
  const retryDelays = [25, 100, 250, 500, 1000, 2000, 5000];
  for (const delay of retryDelays) setTimeout(() => void register(), delay);
  window.addEventListener("pageshow", () => void register());
  window.addEventListener("focus", () => void register());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void register();
  });
})();`;
}
