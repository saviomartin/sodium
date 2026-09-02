// @vitest-environment happy-dom
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  compileSodiumConfig,
  DEPLOYMENT_RECEIPT_VERSION,
} from "sodium-webmcp-spec";
import { signDeploymentReceipt } from "sodium-webmcp-spec/signing";
import { compileLocalConfig } from "../src/config";
import { installSodium } from "../src/sdk";

const DEV_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEILuftDsdAMJoHXaJopPeLcaL0R/zleKwStLCFrNy8fUx
-----END PRIVATE KEY-----
`;

const config = {
  schemaVersion: 1,
  app: { name: "Fixture", origins: ["http://localhost:4000"] },
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

function projectFor(input: unknown) {
  const compiled = compileSodiumConfig(input);
  const configHash = createHash("sha256")
    .update(JSON.stringify(compiled))
    .digest("hex");
  const deployment = {
    id: "dep_abcdefghijklmnop",
    version: 3,
    configHash,
    receipt: signDeploymentReceipt(
      {
        receiptVersion: DEPLOYMENT_RECEIPT_VERSION,
        projectId: "prj_abcdefghijkl",
        deploymentId: "dep_abcdefghijklmnop",
        version: 3,
        configHash,
        origins: compiled.app.origins,
      },
      { keyId: "dev-insecure-1", privateKeyPem: DEV_PRIVATE_KEY },
    ),
  };
  return {
    schemaVersion: 1 as const,
    projectId: "prj_abcdefghijkl",
    publishableKey: `sod_pk_${"a".repeat(32)}`,
    endpoint: "https://sodium.example",
    deployment,
  };
}

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

  it("registers local tools only with a valid deployment receipt", async () => {
    expect(compileLocalConfig(config)).toEqual(compileSodiumConfig(config));
    const registerTool = vi.fn(async () => {});
    document.modelContext = { registerTool };
    const fetcher = vi.spyOn(window, "fetch");

    const handle = await installSodium({
      config,
      project: projectFor(config),
      document,
      debug: true,
    });

    expect(handle.available).toBe(true);
    expect(handle.registered()).toEqual(["read_heading"]);
    expect(registerTool).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
    handle.dispose();
  });

  it("registers zero tools before the first deployment", async () => {
    const registerTool = vi.fn(async () => {});
    document.modelContext = { registerTool };

    const handle = await installSodium({ config, document, debug: true });

    expect(handle.available).toBe(false);
    expect(handle.registered()).toEqual([]);
    expect(registerTool).not.toHaveBeenCalled();
  });

  it("sends zero telemetry before the first deployment", async () => {
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "https://chatgpt.com/c/example",
    });
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(window.navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon,
    });

    await installSodium({
      config: { ...config, telemetry: { enabled: true } },
      document,
    });

    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("registers zero tools when sodium.json changed after deployment", async () => {
    const registerTool = vi.fn(async () => {});
    document.modelContext = { registerTool };
    const changed = {
      ...config,
      app: { ...config.app, name: "Changed after deploy" },
    };

    const handle = await installSodium({
      config: changed,
      project: projectFor(config),
      document,
    });

    expect(handle.available).toBe(false);
    expect(registerTool).not.toHaveBeenCalled();
  });

  it("registers zero tools with a tampered receipt", async () => {
    const registerTool = vi.fn(async () => {});
    document.modelContext = { registerTool };
    const project = projectFor(config);
    const signature = project.deployment.receipt.signature;
    project.deployment.receipt.signature = `${signature.slice(0, -1)}${signature.endsWith("a") ? "b" : "a"}`;

    const handle = await installSodium({ config, project, document });

    expect(handle.available).toBe(false);
    expect(registerTool).not.toHaveBeenCalled();
  });

  it("registers zero tools on an origin outside the signed contract", async () => {
    const registerTool = vi.fn(async () => {});
    document.modelContext = { registerTool };
    const wrongOriginConfig = {
      ...config,
      app: { ...config.app, origins: ["https://app.example"] },
    };

    const handle = await installSodium({
      config: wrongOriginConfig,
      project: projectFor(wrongOriginConfig),
      document,
    });

    expect(handle.available).toBe(false);
    expect(registerTool).not.toHaveBeenCalled();
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
      project: projectFor({ ...config, telemetry: { enabled: true } }),
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
    const handle = await installSodium({
      config: conditionalConfig,
      project: projectFor(conditionalConfig),
      document,
    });
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
