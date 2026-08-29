// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTelemetry } from "../src/telemetry";

describe("createTelemetry", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("uses a CORS-safelisted content type for cross-origin Beacon", () => {
    const sendBeacon = vi.fn((...args: Parameters<Navigator["sendBeacon"]>) => {
      void args;
      return true;
    });
    Object.defineProperty(window.navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon,
    });

    createTelemetry(
      "https://sodium.example/api/events",
      "site_abcdefgh",
      "1.0.0",
      window,
    ).event("loader_ready", { tools: 4 });

    const blob = sendBeacon.mock.calls[0]?.[1] as Blob;
    expect(blob.type).toBe("text/plain;charset=utf-8");
  });

  it("falls back to fetch when the browser cannot queue the Beacon", async () => {
    Object.defineProperty(window.navigator, "sendBeacon", {
      configurable: true,
      value: vi.fn((...args: Parameters<Navigator["sendBeacon"]>) => {
        void args;
        return false;
      }),
    });
    const fetcher = vi.fn(async () => new Response(null, { status: 202 }));
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetcher,
    });

    createTelemetry(
      "https://sodium.example/api/events",
      "site_abcdefgh",
      "1.0.0",
      window,
    ).event("loader_ready");
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  });
});
