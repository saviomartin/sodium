// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerEngineAttribution, createTelemetry } from "../src/telemetry";

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
    return blob.text().then((body) => {
      expect(JSON.parse(body)).toMatchObject({
        event: "tool_succeeded",
        sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      });
      expect(body).not.toContain("input");
      expect(body).not.toContain("output");
    });
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

  it("attributes exact answer-engine hosts and their subdomains", () => {
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "https://chatgpt.com/c/answer",
    });
    expect(answerEngineAttribution(window, document)).toEqual({
      answerEngine: "ChatGPT",
      attributionMethod: "referrer",
    });
  });

  it("rejects lookalike hosts", () => {
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "https://evilchatgpt.com/c/answer",
    });
    expect(answerEngineAttribution(window, document)).toBeNull();
  });

  it("uses allowlisted campaign attribution when referrer is unavailable", () => {
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "",
    });
    window.history.replaceState({}, "", "/?utm_source=claude");
    expect(answerEngineAttribution(window, document)).toEqual({
      answerEngine: "Claude",
      attributionMethod: "campaign",
    });
  });
});
