// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installSodium } from "../src/sdk";

const config = {
  schemaVersion: 1,
  app: { name: "Fixture", origins: ["https://example.com"] },
  telemetry: { enabled: false },
  tools: [
    {
      id: "tl_abcdefgh",
      name: "read_heading",
      description: "Read the current page heading for the active application.",
      input: {},
      on: ["/**"],
      run: {
        extract: { fields: [{ name: "heading", selector: "h1" }] },
      },
      risk: "read_only",
    },
  ],
};

const contextProject = {
  schemaVersion: 1,
  projectId: "prj_abcdefghijkl",
  publishableKey: `sod_pk_${"a".repeat(32)}`,
  endpoint: "https://sodium.example",
} as const;

describe("installSodium", () => {
  beforeEach(() => {
    document.body.innerHTML = "<h1>Fixture</h1>";
    document.modelContext = undefined;
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "",
    });
    window.history.replaceState({}, "", "/");
  });

  it("registers sodium.json tools without fetching a manifest", async () => {
    const registerTool = vi.fn(async () => {});
    document.modelContext = { registerTool };
    const fetcher = vi.spyOn(window, "fetch");

    const handle = await installSodium({ config, document });

    expect(handle.available).toBe(true);
    expect(handle.registered()).toEqual(["read_heading"]);
    expect(registerTool).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
    handle.dispose();
  });

  it("fails closed on malformed local config", async () => {
    document.modelContext = { registerTool: vi.fn(async () => {}) };
    const handle = await installSodium({
      config: { schemaVersion: 1 },
      document,
    });
    expect(handle.available).toBe(false);
    expect(handle.registered()).toEqual([]);
  });

  it("records an answer-engine referral without WebMCP support", async () => {
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "https://claude.ai/chat/example",
    });
    const sendBeacon = vi.fn(
      (url: string, data: Blob) => url.length > 0 && data.size > 0,
    );
    Object.defineProperty(window.navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon,
    });

    const handle = await installSodium({
      config: { ...config, telemetry: { enabled: true } },
      project: contextProject,
      document,
    });

    expect(handle.available).toBe(false);
    expect(sendBeacon).toHaveBeenCalledOnce();
    const body = await (sendBeacon.mock.calls[0]?.[1] as Blob).text();
    expect(JSON.parse(body)).toMatchObject({
      event: "answer_engine_referral",
      answerEngine: "Claude",
      attributionMethod: "referrer",
    });
  });

  it("refreshes conditional tools when application state changes attributes", async () => {
    const registerTool = vi.fn(async () => {});
    document.modelContext = { registerTool };
    const conditionalConfig = {
      ...config,
      tools: [
        ...config.tools,
        {
          ...config.tools[0],
          id: "tl_condtool",
          name: "read_conditional_heading",
          on: [{ path: "/**", when: "[data-ready]" }],
        },
      ],
    };
    const handle = await installSodium({ config: conditionalConfig, document });
    expect(handle.registered()).toEqual(["read_heading"]);

    document.body.dataset.ready = "";
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(handle.registered()).toEqual([
      "read_conditional_heading",
      "read_heading",
    ]);
    expect(registerTool).toHaveBeenCalledTimes(2);
    handle.dispose();
  });
});
