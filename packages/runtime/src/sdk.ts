import type { SodiumConfig, SodiumProject } from "sodium-webmcp-spec";
import { compileLocalConfig } from "./config";
import { executeTool, type SodiumHandlers } from "./handlers";
import {
  answerEngineAttribution,
  createTelemetry,
  noopTelemetry,
} from "./telemetry";
import {
  createToolRegistrar,
  detectModelContext,
  observeNavigation,
} from "./webmcp-adapter";

export interface InstallSodiumOptions {
  config: SodiumConfig | unknown;
  project?: SodiumProject | null;
  handlers?: SodiumHandlers;
  document?: Document;
  debug?: boolean;
}

export interface SodiumHandle {
  available: boolean;
  registered(): string[];
  refresh(): Promise<void>;
  dispose(): void;
}

export async function installSodium(
  options: InstallSodiumOptions,
): Promise<SodiumHandle> {
  const doc = options.document ?? globalThis.document;
  const win = doc?.defaultView ?? null;
  const empty: SodiumHandle = {
    available: false,
    registered: () => [],
    refresh: async () => {},
    dispose: () => {},
  };
  if (!doc || !win) return empty;

  const compiled = compileLocalConfig(options.config);
  if (!compiled) {
    if (options.debug) {
      win.console.error("[sodium] invalid sodium.json");
    }
    return empty;
  }

  const telemetry =
    compiled.telemetry.enabled && options.project
      ? createTelemetry(
          {
            endpoint: options.project.endpoint,
            projectId: options.project.projectId,
            publishableKey: options.project.publishableKey,
            deploymentId: options.project.deployment?.id,
            configVersion: options.project.deployment?.version,
          },
          win,
        )
      : noopTelemetry;

  const attribution = answerEngineAttribution(win, doc);
  if (attribution) {
    telemetry.event("answer_engine_referral", attribution);
  }

  const modelContext = detectModelContext(doc);
  if (!modelContext) {
    if (options.debug) win.console.info("[sodium] WebMCP is unavailable");
    return empty;
  }

  const registrar = createToolRegistrar(
    modelContext,
    doc,
    compiled.tools,
    (tool) => async (input, execution) => {
      const invocationId = win.crypto.randomUUID?.() ?? fallbackInvocationId();
      const startedAt = performance.now();
      telemetry.event("tool_started", {
        toolId: tool.id,
        toolName: tool.name,
        invocationId,
      });
      const result = await executeTool(
        tool,
        input,
        doc,
        execution?.signal,
        options.handlers,
      );
      const fields = {
        toolId: tool.id,
        toolName: tool.name,
        invocationId,
        durationMs: Math.round(performance.now() - startedAt),
      };
      if (result.ok) telemetry.event("tool_succeeded", fields);
      else {
        const errorCode =
          typeof result.error === "string" ? result.error : "unknown";
        telemetry.event(
          errorCode === "user_denied" ? "confirmation_denied" : "tool_failed",
          { ...fields, errorCode },
        );
      }
      return result;
    },
    (event, toolName) => {
      const tool = compiled.tools.find(
        (candidate) => candidate.name === toolName,
      );
      if (event === "registered") {
        telemetry.event("tool_registered", { toolId: tool?.id, toolName });
      } else if (event === "register_failed") {
        telemetry.event("tool_register_failed", { toolId: tool?.id, toolName });
      }
    },
  );

  await registrar.sync();
  telemetry.event("sdk_ready");
  const stopNavigation = observeNavigation(win, () => void registrar.sync());
  let queued = false;
  const observer = new win.MutationObserver(() => {
    if (queued) return;
    queued = true;
    win.setTimeout(() => {
      queued = false;
      void registrar.sync();
    }, 200);
  });
  observer.observe(doc.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
  });

  return {
    available: true,
    registered: () => registrar.registered(),
    refresh: () => registrar.sync(),
    dispose() {
      observer.disconnect();
      stopNavigation();
      registrar.dispose();
    },
  };
}

function fallbackInvocationId(): string {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (digit) =>
    (
      Number(digit) ^
      (crypto.getRandomValues(new Uint8Array(1))[0]! &
        (15 >> (Number(digit) / 4)))
    ).toString(16),
  );
}

export type {
  SodiumHandler,
  SodiumHandlerContext,
  SodiumHandlers,
} from "./handlers";
export type { SodiumConfig, SodiumProject } from "sodium-webmcp-spec";
