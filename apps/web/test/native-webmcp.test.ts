import { describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import {
  createNativeWebMcpDispatcher,
  createNativeWebMcpTools,
  describeNativeWebMcpCapabilities,
  getNativeModelContext,
  nativeWebMcpBootstrapScript,
  NATIVE_WEBMCP_TOOL_DEFINITIONS,
  registerNativeWebMcpTools,
  type NativeWebMcpBridge,
  type NativeModelContext,
  type NativeWebMcpHandlers,
} from "../lib/native-webmcp";

function handlers(): NativeWebMcpHandlers {
  return {
    describeCapabilities: vi.fn(async () => describeNativeWebMcpCapabilities()),
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
      "sodium_describe_capabilities",
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
      "sodium_describe_capabilities",
      "sodium_get_app_state",
      "sodium_list_projects",
      "sodium_get_project",
      "sodium_get_deployed_tool",
    ]);
    expect(
      reads
        .filter((tool) => tool.name !== "sodium_describe_capabilities")
        .every((tool) => tool.annotations.untrustedContentHint),
    ).toBe(true);
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

  it("rejects malformed transport input before it reaches a handler", async () => {
    const toolHandlers = handlers();
    const dispatch = createNativeWebMcpDispatcher(toolHandlers);
    await expect(
      dispatch("sodium_get_app_state", null as never),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    expect(toolHandlers.getAppState).not.toHaveBeenCalled();
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

  it("describes the full site-tool contract through a matching read tool", () => {
    const result = describeNativeWebMcpCapabilities();
    expect(result.toolCount).toBe(NATIVE_WEBMCP_TOOL_DEFINITIONS.length);
    expect(result.tools.map((tool) => tool.name)).toEqual(
      NATIVE_WEBMCP_TOOL_DEFINITIONS.map((tool) => tool.name),
    );
    expect(
      result.tools.find((tool) => tool.name === "sodium_describe_capabilities")
        ?.readOnly,
    ).toBe(true);
  });

  it("uses document.modelContext first and supports the legacy navigator surface", () => {
    const current = { registerTool: vi.fn(async () => undefined) };
    const legacy = { registerTool: vi.fn(async () => undefined) };
    expect(
      getNativeModelContext(
        { modelContext: current },
        { modelContext: legacy },
      ),
    ).toBe(current);
    expect(getNativeModelContext({}, { modelContext: legacy })).toBe(legacy);
  });

  it.each(["document", "navigator"] as const)(
    "registers before hydration on the %s WebMCP surface",
    async (surface) => {
      const registered: Array<{
        name: string;
        execute(
          input: Record<string, unknown>,
          options?: { signal?: AbortSignal },
        ): Promise<unknown>;
      }> = [];
      const modelContext = {
        registerTool: vi.fn(async (definition) => {
          registered.push(definition);
        }),
      };
      const listeners = new Map<string, () => void>();
      const windowObject: {
        addEventListener: ReturnType<typeof vi.fn>;
        dispatchEvent: ReturnType<typeof vi.fn>;
        __sodiumWebMcp?: NativeWebMcpBridge;
      } = {
        addEventListener: vi.fn((name: string, listener: () => void) => {
          listeners.set(name, listener);
        }),
        dispatchEvent: vi.fn(),
      };
      const documentObject = {
        addEventListener: vi.fn(),
        visibilityState: "visible",
        ...(surface === "document" ? { modelContext } : {}),
      };
      const navigatorObject = surface === "navigator" ? { modelContext } : {};

      runInNewContext(nativeWebMcpBootstrapScript(), {
        window: windowObject,
        document: documentObject,
        navigator: navigatorObject,
        AbortController,
        DOMException,
        CustomEvent: class {
          constructor(
            public readonly type: string,
            public readonly init?: { detail: unknown },
          ) {}
        },
        setTimeout: vi.fn(() => 1),
        clearTimeout: vi.fn(),
        Set,
        Promise,
        Error,
        String,
      });
      await windowObject.__sodiumWebMcp?.register();

      expect(registered.map((tool) => tool.name)).toEqual(
        NATIVE_WEBMCP_TOOL_DEFINITIONS.map((tool) => tool.name),
      );
      expect(windowObject.__sodiumWebMcp?.getStatus()).toMatchObject({
        phase: "ready",
        registeredCount: NATIVE_WEBMCP_TOOL_DEFINITIONS.length,
        apiSurface: surface,
      });
      await expect(registered[0]?.execute({})).resolves.toMatchObject({
        ok: true,
        toolCount: NATIVE_WEBMCP_TOOL_DEFINITIONS.length,
      });

      const appState = registered.find(
        (tool) => tool.name === "sodium_get_app_state",
      );
      const cancellation = new AbortController();
      const cancelled = appState?.execute({}, { signal: cancellation.signal });
      cancellation.abort();
      await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });

      const pending = appState?.execute({});
      windowObject.__sodiumWebMcp?.setHandler(async (name) => ({
        ok: true,
        name,
      }));
      await expect(pending).resolves.toEqual({
        ok: true,
        name: "sodium_get_app_state",
      });
    },
  );

  it("recovers a transient partial registration without duplicating tools", async () => {
    const attempts = new Map<string, number>();
    const registered = new Set<string>();
    const modelContext = {
      registerTool: vi.fn(async (definition: { name: string }) => {
        const count = (attempts.get(definition.name) ?? 0) + 1;
        attempts.set(definition.name, count);
        if (definition.name === "sodium_get_app_state" && count === 1) {
          throw new Error("temporary browser bridge failure");
        }
        if (registered.has(definition.name)) {
          throw new Error("duplicate registration");
        }
        registered.add(definition.name);
      }),
    };
    const windowObject: {
      addEventListener: ReturnType<typeof vi.fn>;
      dispatchEvent: ReturnType<typeof vi.fn>;
      __sodiumWebMcp?: NativeWebMcpBridge;
    } = {
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
    runInNewContext(nativeWebMcpBootstrapScript(), {
      window: windowObject,
      document: {
        modelContext,
        addEventListener: vi.fn(),
        visibilityState: "visible",
      },
      navigator: {},
      AbortController,
      DOMException,
      CustomEvent: class {},
      setTimeout: vi.fn(() => 1),
      clearTimeout: vi.fn(),
      Set,
      Promise,
      Error,
      String,
    });
    await windowObject.__sodiumWebMcp?.register();
    expect(windowObject.__sodiumWebMcp?.getStatus()).toMatchObject({
      phase: "registration_failed",
      registeredCount: NATIVE_WEBMCP_TOOL_DEFINITIONS.length - 1,
    });

    await windowObject.__sodiumWebMcp?.register();
    expect(registered.size).toBe(NATIVE_WEBMCP_TOOL_DEFINITIONS.length);
    expect(windowObject.__sodiumWebMcp?.getStatus()).toMatchObject({
      phase: "ready",
      registeredCount: NATIVE_WEBMCP_TOOL_DEFINITIONS.length,
      errors: [],
    });
    expect(
      Array.from(attempts.values()).filter((count) => count > 1),
    ).toEqual([2]);
  });

  it("retries when the browser injects WebMCP after the page script runs", async () => {
    const callbacks: Array<() => void> = [];
    const registered: string[] = [];
    const documentObject: {
      modelContext?: NativeModelContext;
      visibilityState: string;
      addEventListener(): void;
    } = {
      visibilityState: "visible",
      addEventListener: vi.fn(),
    };
    const windowObject: {
      addEventListener: ReturnType<typeof vi.fn>;
      dispatchEvent: ReturnType<typeof vi.fn>;
      __sodiumWebMcp?: NativeWebMcpBridge;
    } = {
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
    runInNewContext(nativeWebMcpBootstrapScript(), {
      window: windowObject,
      document: documentObject,
      navigator: {},
      AbortController,
      DOMException,
      CustomEvent: class {},
      setTimeout: vi.fn((callback: () => void) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
      clearTimeout: vi.fn(),
      Set,
      Promise,
      Error,
      String,
    });
    expect(windowObject.__sodiumWebMcp?.getStatus().phase).toBe(
      "waiting_for_browser",
    );

    documentObject.modelContext = {
      registerTool: vi.fn(async (definition) => {
        registered.push(definition.name);
      }),
    };
    callbacks[0]?.();
    await windowObject.__sodiumWebMcp?.register();

    expect(registered).toHaveLength(NATIVE_WEBMCP_TOOL_DEFINITIONS.length);
    expect(windowObject.__sodiumWebMcp?.getStatus().phase).toBe("ready");
  });
});
