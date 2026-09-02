export const SDK_VERSION = "0.1.0";

export type SodiumEventName =
  | "sdk_ready"
  | "tool_registered"
  | "tool_register_failed"
  | "tool_started"
  | "tool_succeeded"
  | "tool_failed"
  | "confirmation_denied";

export interface TelemetryContext {
  endpoint: string;
  projectId: string;
  publishableKey: string;
  deploymentId?: string;
  configVersion?: number;
}

export interface Telemetry {
  event(
    name: SodiumEventName,
    fields?: {
      toolId?: string;
      toolName?: string;
      invocationId?: string;
      durationMs?: number;
      errorCode?: string;
    },
  ): void;
}

const MAX_EVENTS_PER_PAGE = 100;

export function createTelemetry(
  context: TelemetryContext | null,
  win: Window | null,
): Telemetry {
  let sent = 0;
  return {
    event(name, fields = {}) {
      if (!context || !win || sent >= MAX_EVENTS_PER_PAGE) return;
      sent++;
      const body = JSON.stringify({
        projectId: context.projectId,
        key: context.publishableKey,
        deploymentId: context.deploymentId,
        configVersion: context.configVersion,
        sdkVersion: SDK_VERSION,
        event: name,
        ...fields,
        ts: Date.now(),
      });
      try {
        if (typeof win.navigator?.sendBeacon === "function") {
          const queued = win.navigator.sendBeacon(
            new URL("/api/events", context.endpoint).toString(),
            new Blob([body], { type: "text/plain;charset=UTF-8" }),
          );
          if (queued) return;
        }
        void win
          .fetch(new URL("/api/events", context.endpoint), {
            method: "POST",
            body,
            headers: { "content-type": "text/plain;charset=UTF-8" },
            keepalive: true,
            credentials: "omit",
          })
          .catch(() => {});
      } catch {
        // Analytics must never affect the host application.
      }
    },
  };
}

export const noopTelemetry: Telemetry = { event: () => {} };
