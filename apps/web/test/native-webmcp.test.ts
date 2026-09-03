import { describe, expect, it, vi } from "vitest";
import {
  createNativeWebMcpTools,
  registerNativeWebMcpTools,
  type NativeModelContext,
  type NativeWebMcpHandlers,
} from "../lib/native-webmcp";

function handlers(): NativeWebMcpHandlers {
  return {
    getAppState: vi.fn(async () => ({ ok: true })),
    listProjects: vi.fn(async () => ({ ok: true, projects: [] })),
    getProject: vi.fn(async (input) => ({ ok: true, input })),
    getTool: vi.fn(async (input) => ({ ok: true, input })),
    navigate: vi.fn(async (input) => ({ ok: true, input })),
    openProject: vi.fn(async (input) => ({ ok: true, input })),
    signIn: vi.fn(async (input) => ({ ok: true, input })),
    signOut: vi.fn(async (input) => ({ ok: true, input })),
    authorizeCli: vi.fn(async (input) => ({ ok: true, input })),
    deleteProject: vi.fn(async (input) => ({ ok: true, input })),
    deleteAccount: vi.fn(async (input) => ({ ok: true, input })),
  };
}

describe("native Sodium WebMCP contract", () => {
  it("covers every user-facing dashboard capability with unique names", () => {
    const tools = createNativeWebMcpTools(handlers());
    expect(tools.map((tool) => tool.name)).toEqual([
      "sodium_get_app_state",
      "sodium_list_projects",
      "sodium_get_project",
      "sodium_get_deployed_tool",
      "sodium_navigate",
      "sodium_open_project",
      "sodium_sign_in",
      "sodium_sign_out",
      "sodium_authorize_cli",
      "sodium_delete_project",
      "sodium_delete_account",
    ]);
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length);
    expect(
      tools.every(
        (tool) =>
          tool.inputSchema.type === "object" &&
          tool.inputSchema.additionalProperties === false,
      ),
    ).toBe(true);
  });

  it("marks reads and untrusted dashboard data accurately", () => {
    const tools = createNativeWebMcpTools(handlers());
    const reads = tools.filter((tool) => tool.annotations.readOnlyHint);
    expect(reads.map((tool) => tool.name)).toEqual([
      "sodium_get_app_state",
      "sodium_list_projects",
      "sodium_get_project",
      "sodium_get_deployed_tool",
    ]);
    expect(reads.every((tool) => tool.annotations.untrustedContentHint)).toBe(
      true,
    );
    expect(
      tools.find((tool) => tool.name === "sodium_delete_project")?.description,
    ).toContain("DESTRUCTIVE");
  });

  it("passes structured arguments to the matching handler", async () => {
    const toolHandlers = handlers();
    const tool = createNativeWebMcpTools(toolHandlers).find(
      (candidate) => candidate.name === "sodium_get_project",
    );
    await expect(
      tool?.execute({ projectId: "prj_abcdefgh", days: 7 }),
    ).resolves.toEqual({
      ok: true,
      input: { projectId: "prj_abcdefgh", days: 7 },
    });
    expect(toolHandlers.getProject).toHaveBeenCalledOnce();
  });

  it("registers every tool and unregisters them through one abort signal", async () => {
    const registered: string[] = [];
    const signals: AbortSignal[] = [];
    const modelContext: NativeModelContext = {
      registerTool: vi.fn(async (tool, options) => {
        registered.push(tool.name);
        if (options?.signal) signals.push(options.signal);
      }),
    };
    const controller = new AbortController();
    const tools = createNativeWebMcpTools(handlers());
    await registerNativeWebMcpTools(modelContext, tools, controller.signal);
    expect(registered).toEqual(tools.map((tool) => tool.name));
    expect(signals).toHaveLength(tools.length);
    expect(signals.every((signal) => signal === controller.signal)).toBe(true);
    controller.abort();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
