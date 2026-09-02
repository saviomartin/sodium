// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTelemetry } from "../src/telemetry";

const context = {
  endpoint: "https://sodium.example",
  projectId: "prj_abcdefghijkl",
  publishableKey: `sod_pk_${"a".repeat(32)}`,
};

describe("createTelemetry", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("uses a CORS-safelisted content type and sends no tool arguments", () => {
    const sendBeacon = vi.fn(
      (url: string, data: Blob) => url.length > 0 && data.size > 0,
    );
    Object.defineProperty(window.navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon,
    });

    createTelemetry(context, window).event("tool_succeeded", {
      toolId: "tl_abcdefgh",
      toolName: "open_product",
      durationMs: 12,
    });

    const blob = sendBeacon.mock.calls[0]?.[1] as Blob;
    expect(blob.type).toBe("text/plain;charset=utf-8");
    expect(sendBeacon.mock.calls[0]?.[0]).toBe(
      "https://sodium.example/api/events",
    );
  });

  it("falls back to fetch when Beacon cannot queue the event", async () => {
    Object.defineProperty(window.navigator, "sendBeacon", {
      configurable: true,
      value: vi.fn(() => false),
    });
    const fetcher = vi.fn(async () => new Response(null, { status: 202 }));
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetcher,
    });

    createTelemetry(context, window).event("sdk_ready");
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  });
});
