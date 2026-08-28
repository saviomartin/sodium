/**
 * Minimal, privacy-preserving operational events. By design this NEVER sends
 * tool inputs, tool outputs, or page contents — only event names, tool names
 * (which are already public in the manifest), timing, and coarse status.
 */

export interface Telemetry {
  event(name: string, data?: Record<string, string | number | boolean>): void;
}

const MAX_EVENTS_PER_PAGE = 40;

export function createTelemetry(
  endpoint: string | null,
  siteId: string,
  loaderVersion: string,
  win: Window | null,
): Telemetry {
  let sent = 0;
  return {
    event(name, data) {
      if (!endpoint || !win || sent >= MAX_EVENTS_PER_PAGE) return;
      sent++;
      const body = JSON.stringify({
        siteId,
        loader: loaderVersion,
        event: name,
        data: data ?? {},
        ts: Date.now(),
      });
      try {
        if (win.navigator && typeof win.navigator.sendBeacon === "function") {
          win.navigator.sendBeacon(
            endpoint,
            new Blob([body], { type: "application/json" }),
          );
        } else if (typeof win.fetch === "function") {
          void win
            .fetch(endpoint, {
              method: "POST",
              body,
              headers: { "content-type": "application/json" },
              keepalive: true,
              credentials: "omit",
            })
            .catch(() => {});
        }
      } catch {
        // Telemetry must never break the host page.
      }
    },
  };
}

export const noopTelemetry: Telemetry = { event: () => {} };
