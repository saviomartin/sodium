import type { BridgeContext, BridgeHandler, BridgeRegistry } from "./types";

export type { BridgeContext, BridgeHandler };

/**
 * First-party action bridge SDK. Customer code (typically the generated
 * `sodium/bridge.ts` in their repository) registers handlers for approved
 * bridge keys; the loader looks them up at invocation time, so load order
 * does not matter. Handlers run entirely in the customer's page and call the
 * customer's own functions — authentication, authorization, validation,
 * idempotency and consequential confirmation stay in the customer's stack.
 */
export function registerBridgeHandlers(
  handlers: Record<string, BridgeHandler>,
): () => void {
  if (typeof window === "undefined") return () => {};
  const registry: BridgeRegistry = (window.__sodiumBridge ??= {
    handlers: new Map(),
  });
  const registeredKeys: string[] = [];
  for (const [key, handler] of Object.entries(handlers)) {
    if (typeof handler !== "function") continue;
    if (registry.handlers.has(key)) {
      console.warn(`[sodium] bridge handler "${key}" replaced`);
    }
    registry.handlers.set(key, handler);
    registeredKeys.push(key);
  }
  return () => {
    for (const key of registeredKeys) registry.handlers.delete(key);
  };
}
