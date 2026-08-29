// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  generateManifestKeyPair,
  signManifest,
} from "@sodium/contracts/signing";
import { ToolManifestSchema } from "@sodium/contracts";
import { bootstrap } from "../src/loader";
import type { ModelContextLike, WebMcpToolDescriptor } from "../src/types";
import { makeManifest, makeTool } from "./manifest-fixture";

const key = generateManifestKeyPair("key_test");
const cryptoImpl = webcrypto as unknown as Crypto;

/** Minimal in-memory WebMCP implementation mirroring the current IDL. */
function fakeModelContext() {
  const tools = new Map<string, WebMcpToolDescriptor>();
  const modelContext: ModelContextLike = {
    async registerTool(tool, options) {
      if (tools.has(tool.name)) throw new Error(`duplicate tool: ${tool.name}`);
      tools.set(tool.name, tool);
      options?.signal?.addEventListener("abort", () => tools.delete(tool.name));
    },
  };
  return { modelContext, tools };
}

function fetchReturning(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

function signedEnvelope(manifest = makeManifest()) {
  return signManifest(ToolManifestSchema.parse(manifest), {
    keyId: key.keyId,
    privateKeyPem: key.privateKeyPem,
  });
}

async function boot(envelope: unknown, options: { path?: string } = {}) {
  history.pushState(null, "", options.path ?? "/products");
  const { modelContext, tools } = fakeModelContext();
  document.modelContext = modelContext;
  const handle = await bootstrap(document, null, {
    keys: { [key.keyId]: key.publicJwk },
    siteId: "site_abcd1234efgh",
    manifestUrl: "http://localhost:4000/api/m/site_abcd1234efgh",
    telemetryUrl: null,
    fetchImpl: fetchReturning(envelope),
    crypto: cryptoImpl,
  });
  return { handle, tools };
}

beforeEach(() => {
  document.body.innerHTML = "";
  delete (document as { modelContext?: unknown }).modelContext;
});

describe("bootstrap", () => {
  it("registers tools from a validly signed manifest on a matching route", async () => {
    const { handle, tools } = await boot(signedEnvelope());
    expect(handle).not.toBeNull();
    expect(handle!.registered()).toEqual(["list_products"]);
    expect(tools.get("list_products")?.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    });
    handle!.dispose();
    expect(handle!.registered()).toEqual([]);
    expect(tools.size).toBe(0);
  });

  it("fails harmlessly when WebMCP is unavailable", async () => {
    const handle = await bootstrap(document, null, {
      keys: { [key.keyId]: key.publicJwk },
      siteId: "site_abcd1234efgh",
      manifestUrl: "http://localhost:4000/api/m/site_abcd1234efgh",
      fetchImpl: fetchReturning(signedEnvelope()),
      crypto: cryptoImpl,
    });
    expect(handle).toBeNull();
  });

  it("registers nothing for a manifest bound to a different origin", async () => {
    const manifest = makeManifest({ origins: ["https://other.example"] });
    const { handle } = await boot(signedEnvelope(manifest));
    expect(handle).toBeNull();
  });

  it("registers nothing for a different siteId (cross-site replay)", async () => {
    const manifest = makeManifest({ siteId: "site_zzzz9999zzzz" });
    const { handle } = await boot(signedEnvelope(manifest));
    expect(handle).toBeNull();
  });

  it("registers nothing for tampered manifests", async () => {
    const envelope = signedEnvelope();
    const forged = {
      ...envelope,
      payload: Buffer.from("{}").toString("base64url"),
    };
    const { handle } = await boot(forged);
    expect(handle).toBeNull();
  });

  it("registers only tools whose route matches, and re-syncs on navigation", async () => {
    const manifest = makeManifest({
      tools: [
        makeTool(),
        makeTool({
          name: "read_order",
          title: "Read order",
          description: "Reads the order detail page contents.",
          routes: [{ pathPattern: "/orders/*" }],
        }),
      ],
    });
    const { handle } = await boot(signedEnvelope(manifest), {
      path: "/products",
    });
    expect(handle!.registered()).toEqual(["list_products"]);

    history.pushState(null, "", "/orders/ord_1");
    await vi.waitFor(() =>
      expect(handle!.registered()).toEqual(["read_order"]),
    );

    history.pushState(null, "", "/elsewhere");
    await vi.waitFor(() => expect(handle!.registered()).toEqual([]));
  });

  it("honors requiresSelector app-state conditions on refresh", async () => {
    const manifest = makeManifest({
      tools: [
        makeTool({
          name: "read_account",
          title: "Read account",
          description: "Reads account details for the signed-in user.",
          routes: [
            { pathPattern: "/**", requiresSelector: "[data-signed-in]" },
          ],
        }),
      ],
    });
    const { handle } = await boot(signedEnvelope(manifest));
    expect(handle!.registered()).toEqual([]);

    document.body.innerHTML = `<div data-signed-in></div>`;
    await handle!.refresh();
    expect(handle!.registered()).toEqual(["read_account"]);
  });

  it("advertises loader-native interaction tools without customer code", async () => {
    document.body.innerHTML = `<button id="add-to-cart">Add to cart</button>`;
    const manifest = makeManifest({
      tools: [
        makeTool({
          name: "add_to_cart",
          title: "Add to cart",
          handler: {
            kind: "interaction",
            steps: [{ kind: "click", selector: "#add-to-cart" }],
          },
        }),
      ],
    });
    const { handle } = await boot(signedEnvelope(manifest));
    expect(handle!.registered()).toEqual(["add_to_cart"]);
    handle!.dispose();
  });
});
