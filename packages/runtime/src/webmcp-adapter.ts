import type {
  ModelContextLike,
  PublishedTool,
  WebMcpToolDescriptor,
} from "./types";
import { matchesPathPattern } from "./matcher";

/**
 * The ONLY module that touches the WebMCP API surface. The proposal is still
 * evolving (see docs/architecture.md §1.1); everything version-specific —
 * entry point location, registration/unregistration mechanics, annotation
 * vocabulary — is contained here.
 *
 * Current target: W3C WebML CG draft (Aug 2026):
 *   - `document.modelContext` (with deprecated `navigator.modelContext` fallback)
 *   - `registerTool(tool, { signal })`; unregistration ONLY via AbortSignal
 *   - annotations: `readOnlyHint`, `untrustedContentHint`
 */

export function detectModelContext(doc: Document): ModelContextLike | null {
  const candidate =
    doc.modelContext ?? doc.defaultView?.navigator?.modelContext ?? null;
  if (candidate && typeof candidate.registerTool === "function")
    return candidate;
  return null;
}

/** Projects our transport-neutral annotations onto WebMCP's vocabulary. */
export function toWebMcpDescriptor(
  tool: PublishedTool,
  execute: WebMcpToolDescriptor["execute"],
): WebMcpToolDescriptor {
  return {
    name: tool.name,
    title: tool.title,
    description: describeForAgent(tool),
    inputSchema: tool.inputSchema as object,
    annotations: {
      readOnlyHint: tool.annotations.readOnlyHint,
      // Extract handlers surface page/user-generated content verbatim.
      untrustedContentHint: tool.handler.kind === "extract",
    },
    execute,
  };
}

/**
 * WebMCP has no destructive/confirmation annotations yet, so consequential
 * tools carry an explicit notice in the description — the one field every
 * agent reads. Required confirmation is enforced by the hosted loader before
 * it invokes the application's existing browser behavior.
 */
function describeForAgent(tool: PublishedTool): string {
  const notices: string[] = [];
  if (tool.annotations.destructiveHint) notices.push("DESTRUCTIVE action");
  else if (!tool.annotations.readOnlyHint)
    notices.push("changes application state");
  if (tool.confirmation === "required")
    notices.push("requires explicit user confirmation before use");
  else if (tool.confirmation === "recommended")
    notices.push("confirm with the user before use");
  return notices.length > 0
    ? `${tool.description} [${notices.join("; ")}]`
    : tool.description;
}

export interface ToolRegistrar {
  /** Re-evaluates route conditions and (un)registers tools accordingly. */
  sync(): Promise<void>;
  /** Aborts every live registration. */
  dispose(): void;
  /** Names of currently registered tools (for diagnostics/tests). */
  registered(): string[];
}

export function createToolRegistrar(
  modelContext: ModelContextLike,
  doc: Document,
  tools: PublishedTool[],
  makeExecute: (tool: PublishedTool) => WebMcpToolDescriptor["execute"],
  onEvent?: (
    event: "registered" | "unregistered" | "register_failed",
    toolName: string,
  ) => void,
): ToolRegistrar {
  const live = new Map<string, AbortController>();
  let generation = 0;

  const shouldBeActive = (tool: PublishedTool): boolean => {
    const win = doc.defaultView;
    const path = win ? routeLocationPath(win.location) : "/";
    return tool.routes.some((route) => {
      if (!matchesPathPattern(route.pathPattern, path)) return false;
      if (route.requiresSelector && !doc.querySelector(route.requiresSelector))
        return false;
      return true;
    });
  };

  return {
    async sync() {
      const currentGeneration = ++generation;
      for (const tool of tools) {
        const active = live.has(tool.name);
        const wanted = shouldBeActive(tool);
        if (active && !wanted) {
          live.get(tool.name)!.abort();
          live.delete(tool.name);
          onEvent?.("unregistered", tool.name);
        }
      }
      for (const tool of tools) {
        if (generation !== currentGeneration) return; // superseded by a newer sync
        if (live.has(tool.name) || !shouldBeActive(tool)) continue;
        const controller = new AbortController();
        try {
          await modelContext.registerTool(
            toWebMcpDescriptor(tool, makeExecute(tool)),
            {
              signal: controller.signal,
            },
          );
          live.set(tool.name, controller);
          onEvent?.("registered", tool.name);
        } catch {
          // Duplicate name or rejected registration: fail harmlessly.
          onEvent?.("register_failed", tool.name);
        }
      }
    },
    dispose() {
      generation++;
      for (const [name, controller] of live) {
        controller.abort();
        onEvent?.("unregistered", name);
      }
      live.clear();
    },
    registered() {
      return [...live.keys()].sort();
    },
  };
}

/**
 * Invokes `onRouteChange` after SPA navigations. Prefers the Navigation API;
 * falls back to patching history methods (restored via the returned cleanup).
 */
export function observeNavigation(
  win: Window,
  onRouteChange: () => void,
): () => void {
  const navigation = (win as Window & { navigation?: EventTarget }).navigation;
  if (navigation && typeof navigation.addEventListener === "function") {
    const handler = () => queueMicrotask(onRouteChange);
    navigation.addEventListener("currententrychange", handler);
    return () => navigation.removeEventListener("currententrychange", handler);
  }

  const history = win.history;
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  history.pushState = (...args: Parameters<History["pushState"]>) => {
    originalPushState(...args);
    queueMicrotask(onRouteChange);
  };
  history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    originalReplaceState(...args);
    queueMicrotask(onRouteChange);
  };
  const popHandler = () => queueMicrotask(onRouteChange);
  const hashHandler = () => queueMicrotask(onRouteChange);
  win.addEventListener("popstate", popHandler);
  win.addEventListener("hashchange", hashHandler);
  return () => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    win.removeEventListener("popstate", popHandler);
    win.removeEventListener("hashchange", hashHandler);
  };
}

/** HashRouter URLs use /#/path; browser routers continue to use pathname. */
export function routeLocationPath(
  location: Pick<Location, "pathname" | "hash">,
): string {
  if (location.hash.startsWith("#/")) return `/#${location.hash.slice(1)}`;
  return location.pathname || "/";
}
