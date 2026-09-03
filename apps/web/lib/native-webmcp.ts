export interface NativeWebMcpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  };
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

declare global {
  interface Document {
    modelContext?: NativeModelContext;
  }
}

export interface NativeWebMcpHandlers {
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
  definition: Omit<NativeWebMcpTool, "annotations"> & {
    readOnly?: boolean;
    untrustedOutput?: boolean;
  },
): NativeWebMcpTool {
  const { readOnly = false, untrustedOutput = false, ...descriptor } =
    definition;
  return {
    ...descriptor,
    annotations: {
      readOnlyHint: readOnly,
      untrustedContentHint: untrustedOutput,
    },
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
  return [
    tool({
      name: "sodium_get_app_state",
      title: "Get Sodium app state",
      description:
        "Returns the signed-in state, current page, supported destinations, and project summary for the open Sodium dashboard.",
      inputSchema: emptyInput,
      readOnly: true,
      untrustedOutput: true,
      execute: handlers.getAppState,
    }),
    tool({
      name: "sodium_list_projects",
      title: "List projects",
      description:
        "Lists every Sodium project visible to the signed-in user, including its live version, tool count, and update time.",
      inputSchema: emptyInput,
      readOnly: true,
      untrustedOutput: true,
      execute: handlers.listProjects,
    }),
    tool({
      name: "sodium_get_project",
      title: "Get project dashboard",
      description:
        "Returns one project's current deployment, deployed tools, deployment history, and agent analytics without changing the visible page.",
      inputSchema: {
        type: "object",
        properties: { projectId, days: analyticsDays },
        required: ["projectId"],
        additionalProperties: false,
      },
      readOnly: true,
      untrustedOutput: true,
      execute: handlers.getProject,
    }),
    tool({
      name: "sodium_get_deployed_tool",
      title: "Get deployed tool",
      description:
        "Returns the full live contract and analytics for one deployed tool in a Sodium project.",
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
      execute: handlers.getTool,
    }),
    tool({
      name: "sodium_navigate",
      title: "Navigate Sodium",
      description:
        "Opens the Sodium home page, settings, or CLI activation page in the current tab.",
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
              "CLI user code. Used only with the activate_cli destination.",
            pattern: "^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$",
          },
        },
        required: ["destination"],
        additionalProperties: false,
      },
      execute: handlers.navigate,
    }),
    tool({
      name: "sodium_open_project",
      title: "Open project",
      description:
        "Opens a Sodium project dashboard and selects its 7, 30, or 90 day analytics range.",
      inputSchema: {
        type: "object",
        properties: { projectId, days: analyticsDays },
        required: ["projectId"],
        additionalProperties: false,
      },
      execute: handlers.openProject,
    }),
    tool({
      name: "sodium_sign_in",
      title: "Sign in",
      description:
        "Starts Sodium sign-in with GitHub or Google and redirects to that provider. The user completes authentication with the provider.",
      inputSchema: {
        type: "object",
        properties: {
          provider: { type: "string", enum: ["github", "google"] },
          nextPath: {
            type: "string",
            description:
              "Optional Sodium path to return to after sign-in. Defaults to the current page.",
            minLength: 1,
            maxLength: 500,
          },
        },
        required: ["provider"],
        additionalProperties: false,
      },
      execute: handlers.signIn,
    }),
    tool({
      name: "sodium_sign_out",
      title: "Sign out",
      description:
        "Signs out of Sodium in this browser. Only call after the user explicitly asks to sign out.",
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
      execute: handlers.signOut,
    }),
    tool({
      name: "sodium_authorize_cli",
      title: "Authorize Sodium CLI",
      description:
        "Authorizes one pending CLI device code for the signed-in Sodium account. SECURITY-SENSITIVE: only call after the user confirms the same code is visible in their own terminal.",
      inputSchema: {
        type: "object",
        properties: {
          code: {
            type: "string",
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
      execute: handlers.authorizeCli,
    }),
    tool({
      name: "sodium_delete_project",
      title: "Delete project",
      description:
        "DESTRUCTIVE: permanently deletes a Sodium project, all deployments, and all analytics events. It does not alter the application repository. Requires the exact current project name as confirmation.",
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
      execute: handlers.deleteProject,
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
      execute: handlers.deleteAccount,
    }),
  ];
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
