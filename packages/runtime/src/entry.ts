import { bootstrap } from "./loader";

/**
 * IIFE entry for dist/agent.js. Pinned verification keys are injected at
 * build time (scripts/build.mjs) — never fetched, never configurable from
 * page markup.
 */
declare const __SODIUM_KEYS__: Record<string, JsonWebKey>;

const currentScript = document.currentScript;
if (currentScript instanceof HTMLScriptElement) {
  void bootstrap(document, currentScript, { keys: __SODIUM_KEYS__ })
    .then((handle) => {
      if (handle) {
        // Small diagnostic surface for site owners; carries no secrets.
        Object.defineProperty(window, "__sodium", {
          value: {
            version: handle.manifestVersion,
            siteId: handle.siteId,
            registered: handle.registered,
            refresh: handle.refresh,
          },
          configurable: true,
        });
      }
    })
    .catch(() => {
      // Never break the host page.
    });
}
