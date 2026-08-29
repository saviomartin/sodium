import { verifyEnvelope } from "./manifest-verify";
import { executeTool } from "./handlers";
import {
  answerEngineAttribution,
  createTelemetry,
  noopTelemetry,
  type Telemetry,
} from "./telemetry";
import {
  createToolRegistrar,
  detectModelContext,
  observeNavigation,
  type ToolRegistrar,
} from "./webmcp-adapter";
import type { PublishedTool, ToolManifest } from "./types";
import { BRIDGE_CHANGE_EVENT } from "./bridge";

/**
 * The loader is the delivery mechanism only. It:
 *  - feature-detects WebMCP and fails harmlessly when absent
 *  - verifies the configured site matches the current origin
 *  - fetches the published manifest and verifies signature + strict schema
 *  - registers/unregisters tools with route and app state
 *  - emits minimal operational events (never inputs or page content)
 * It never evaluates strings, never loads customer-specific code, and every
 * failure path degrades to "no tools registered".
 */

export const LOADER_VERSION = "1.0.0";

export interface BootstrapOptions {
  /** Pinned verification keys by keyId. Injected at build time in the bundle. */
  keys: Record<string, JsonWebKey>;
  siteId?: string;
  manifestUrl?: string;
  telemetryUrl?: string | null;
  fetchImpl?: typeof fetch;
  crypto?: Crypto;
  debug?: boolean;
}

export interface LoaderHandle {
  siteId: string;
  manifestVersion: number;
  registered(): string[];
  refresh(): Promise<void>;
  dispose(): void;
}

interface ScriptConfig {
  siteId: string;
  manifestUrl: string;
  telemetryUrl: string | null;
  debug: boolean;
}

export function readScriptConfig(
  script: HTMLScriptElement,
): ScriptConfig | null {
  const siteId = script.dataset.site;
  if (!siteId || !/^site_[a-z0-9]{8,32}$/.test(siteId)) return null;
  let baseOrigin: string;
  try {
    baseOrigin = new URL(script.src).origin;
  } catch {
    return null;
  }
  const manifestUrl =
    script.dataset.manifest ??
    new URL(`/api/m/${siteId}`, baseOrigin).toString();
  const telemetryUrl =
    script.dataset.telemetry === "off"
      ? null
      : new URL("/api/events", baseOrigin).toString();
  return {
    siteId,
    manifestUrl,
    telemetryUrl,
    debug: script.dataset.debug === "true",
  };
}

export async function bootstrap(
  doc: Document,
  script: HTMLScriptElement | null,
  options: BootstrapOptions,
): Promise<LoaderHandle | null> {
  const win = doc.defaultView;
  if (!win) return null;

  let config: ScriptConfig | null = null;
  if (script) config = readScriptConfig(script);
  if (options.siteId && options.manifestUrl) {
    config = {
      siteId: options.siteId,
      manifestUrl: options.manifestUrl,
      telemetryUrl: options.telemetryUrl ?? null,
      debug: options.debug ?? false,
    };
  }
  if (!config) return null;
  const debug = (message: string) => {
    if (config!.debug) win.console?.warn?.(`[sodium] ${message}`);
  };

  const telemetry: Telemetry = config.telemetryUrl
    ? createTelemetry(config.telemetryUrl, config.siteId, LOADER_VERSION, win)
    : noopTelemetry;
  const answerEngine = answerEngineAttribution(doc.referrer, win.location.href);
  if (answerEngine) {
    telemetry.event("answer_engine_referral", {
      engine: answerEngine.engine,
      method: answerEngine.method,
    });
  }

  // 1. Feature-detect WebMCP; absent → fail harmlessly. Answer-engine referral
  // telemetry above still works in ordinary browsers without WebMCP support.
  const modelContext = detectModelContext(doc);
  if (!modelContext) {
    debug("WebMCP not available in this browser; no tools registered");
    return null;
  }

  // 2. Fetch the published manifest envelope.
  const fetchImpl = options.fetchImpl ?? win.fetch.bind(win);
  let envelope: unknown;
  try {
    const response = await fetchImpl(config.manifestUrl, {
      credentials: "omit",
    });
    if (!response.ok) {
      telemetry.event("manifest_fetch_failed", { status: response.status });
      return null;
    }
    envelope = await response.json();
  } catch {
    telemetry.event("manifest_fetch_failed", { status: 0 });
    return null;
  }

  // 3. Verify signature + strict schema. Fail closed.
  const verified = await verifyEnvelope(
    envelope,
    options.keys,
    options.crypto ?? win.crypto,
  );
  if (!verified.ok) {
    debug(`manifest rejected: ${verified.error}`);
    telemetry.event("manifest_rejected", { reason: verified.error });
    return null;
  }
  const manifest: ToolManifest = verified.manifest;

  // 4. Site + origin binding: the manifest must be for this site AND this
  // exact origin. A manifest served for another customer or replayed onto a
  // different host registers nothing.
  if (manifest.siteId !== config.siteId) {
    telemetry.event("manifest_rejected", { reason: "site_mismatch" });
    return null;
  }
  if (!manifest.origins.includes(win.location.origin)) {
    debug(`origin ${win.location.origin} not in manifest origins`);
    telemetry.event("manifest_rejected", { reason: "origin_mismatch" });
    return null;
  }

  // 5. Register tools for the current route; keep in sync with navigation.
  const makeExecute = (tool: PublishedTool) => {
    return async (
      input: Record<string, unknown>,
      executeOptions?: { signal?: AbortSignal },
    ) => {
      const startedAt = Date.now();
      try {
        const result = await executeTool(
          tool,
          input,
          doc,
          executeOptions?.signal,
        );
        telemetry.event("tool_invoked", {
          tool: tool.name,
          ok: result.ok,
          ms: Date.now() - startedAt,
        });
        return result;
      } catch (error) {
        telemetry.event("tool_invoked", {
          tool: tool.name,
          ok: false,
          ms: Date.now() - startedAt,
        });
        return {
          ok: false,
          error: "handler_exception",
          message: error instanceof Error ? error.message : "unknown",
        };
      }
    };
  };

  const registrar: ToolRegistrar = createToolRegistrar(
    modelContext,
    doc,
    manifest.tools,
    makeExecute,
  );
  await registrar.sync();
  telemetry.event("loader_ready", {
    manifestVersion: manifest.version,
    tools: manifest.tools.length,
    registered: registrar.registered().length,
  });

  const stopNavigation = observeNavigation(win, () => void registrar.sync());
  const onBridgeChange = () => void registrar.sync();
  win.addEventListener(BRIDGE_CHANGE_EVENT, onBridgeChange);

  // Re-evaluate `requiresSelector` conditions when the DOM changes.
  let mutationObserver: MutationObserver | null = null;
  if (
    manifest.tools.some((tool) =>
      tool.routes.some((route) => route.requiresSelector),
    )
  ) {
    let pending = false;
    mutationObserver = new win.MutationObserver(() => {
      if (pending) return;
      pending = true;
      win.setTimeout(() => {
        pending = false;
        void registrar.sync();
      }, 300);
    });
    mutationObserver.observe(doc.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  return {
    siteId: manifest.siteId,
    manifestVersion: manifest.version,
    registered: () => registrar.registered(),
    refresh: () => registrar.sync(),
    dispose: () => {
      stopNavigation();
      win.removeEventListener(BRIDGE_CHANGE_EVENT, onBridgeChange);
      mutationObserver?.disconnect();
      registrar.dispose();
    },
  };
}
