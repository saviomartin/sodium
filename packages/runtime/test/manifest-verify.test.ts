import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import {
  generateManifestKeyPair,
  signManifest,
} from "@sodium/contracts/signing";
import { ToolManifestSchema } from "@sodium/contracts";
import { validateManifest, verifyEnvelope } from "../src/manifest-verify";
import { makeManifest, makeTool } from "./manifest-fixture";

const key = generateManifestKeyPair("key_test");
const keys = { [key.keyId]: key.publicJwk };
const cryptoImpl = webcrypto as unknown as Crypto;

function signed(manifest = makeManifest()) {
  // Signed by the real server-side signer — the cross-implementation check.
  return signManifest(ToolManifestSchema.parse(manifest), {
    keyId: key.keyId,
    privateKeyPem: key.privateKeyPem,
  });
}

describe("verifyEnvelope (cross-checked against @sodium/contracts signing)", () => {
  it("accepts a validly signed manifest", async () => {
    const result = await verifyEnvelope(signed(), keys, cryptoImpl);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.siteId).toBe("site_abcd1234efgh");
      expect(result.manifest.tools).toHaveLength(1);
    }
  });

  it("rejects a tampered payload (stale/substituted manifest)", async () => {
    const envelope = signed();
    const other = signed(makeManifest({ version: 99 }));
    const spliced = { ...envelope, payload: other.payload };
    const result = await verifyEnvelope(spliced, keys, cryptoImpl);
    expect(result).toEqual({ ok: false, error: "bad_signature" });
  });

  it("rejects unknown key ids", async () => {
    const envelope = { ...signed(), keyId: "key_evil" };
    expect((await verifyEnvelope(envelope, keys, cryptoImpl)).ok).toBe(false);
  });

  it("rejects malformed envelopes", async () => {
    for (const bad of [
      null,
      42,
      "x",
      {},
      { algorithm: "RS256", keyId: "k", payload: "a", signature: "b" },
    ]) {
      expect((await verifyEnvelope(bad, keys, cryptoImpl)).ok).toBe(false);
    }
  });

  it("rejects a signed-but-invalid manifest (defense in depth)", async () => {
    // An attacker with the signing key still cannot smuggle executable content.
    const evil = makeManifest();
    (evil.tools[0]! as { handler: unknown }).handler = {
      kind: "script",
      code: "alert(1)",
    };
    const { canonicalJson } = await import("@sodium/contracts");
    const { createPrivateKey, sign } = await import("node:crypto");
    const payloadBytes = new TextEncoder().encode(canonicalJson(evil));
    const signature = sign(
      null,
      payloadBytes,
      createPrivateKey(key.privateKeyPem),
    );
    const envelope = {
      algorithm: "Ed25519",
      keyId: key.keyId,
      payload: Buffer.from(payloadBytes).toString("base64url"),
      signature: Buffer.from(signature).toString("base64url"),
    };
    const result = await verifyEnvelope(envelope, keys, cryptoImpl);
    expect(result).toEqual({ ok: false, error: "manifest_invalid" });
  });
});

describe("validateManifest strictness", () => {
  it("accepts what the contracts schema accepts", () => {
    const manifest = makeManifest();
    expect(ToolManifestSchema.safeParse(manifest).success).toBe(true);
    expect(validateManifest(manifest)).not.toBeNull();
  });

  it("rejects duplicate tool names", () => {
    const manifest = makeManifest({ tools: [makeTool(), makeTool()] });
    expect(validateManifest(manifest)).toBeNull();
  });

  it("rejects unknown handler kinds", () => {
    const manifest = makeManifest({
      tools: [makeTool({ handler: { kind: "eval", code: "x" } as never })],
    });
    expect(validateManifest(manifest)).toBeNull();
  });

  it("rejects event-handler attributes in extract fields", () => {
    const manifest = makeManifest({
      tools: [
        makeTool({
          handler: {
            kind: "extract",
            fields: [{ name: "x", selector: "a", attribute: "onclick" }],
          },
        }),
      ],
    });
    expect(validateManifest(manifest)).toBeNull();
  });

  it("rejects extra keys on handlers", () => {
    const manifest = makeManifest({
      tools: [
        makeTool({
          handler: {
            kind: "navigate",
            urlTemplate: "/x",
            onInvoke: "javascript:alert(1)",
          } as never,
        }),
      ],
    });
    expect(validateManifest(manifest)).toBeNull();
  });

  it("rejects protocol-relative navigate templates", () => {
    const manifest = makeManifest({
      tools: [
        makeTool({
          handler: { kind: "navigate", urlTemplate: "//evil.example/x" },
        }),
      ],
    });
    expect(validateManifest(manifest)).toBeNull();
  });

  it("accepts bounded interaction and same-origin request handlers", () => {
    const manifest = makeManifest({
      tools: [
        makeTool({
          name: "cancel_order",
          handler: {
            kind: "interaction",
            steps: [{ kind: "click", selector: "#cancel-order" }],
            postcondition: { kind: "selector_absent", selector: "#open-order" },
          },
        }),
        makeTool({
          name: "sign_out",
          handler: {
            kind: "interaction",
            steps: [{ kind: "click", role: "button", name: "Sign out" }],
          },
        }),
        makeTool({
          name: "add_to_cart",
          handler: {
            kind: "request",
            method: "POST",
            pathTemplate: "/api/cart/{productId}",
            body: { encoding: "json", fieldMap: { quantity: "quantity" } },
            response: "json",
          },
        }),
      ],
    });
    expect(validateManifest(manifest)).not.toBeNull();
  });

  it("rejects cross-origin and body-bearing GET requests", () => {
    expect(
      validateManifest(
        makeManifest({
          tools: [
            makeTool({
              handler: {
                kind: "request",
                method: "POST",
                pathTemplate: "//evil.example",
                response: "status",
              },
            }),
          ],
        }),
      ),
    ).toBeNull();
    expect(
      validateManifest(
        makeManifest({
          tools: [
            makeTool({
              handler: {
                kind: "request",
                method: "GET",
                pathTemplate: "/api/items",
                body: { encoding: "json", fieldMap: {} },
                response: "json",
              },
            }),
          ],
        }),
      ),
    ).toBeNull();
  });

  it("rejects unknown schema keywords ($ref smuggling)", () => {
    const manifest = makeManifest({
      tools: [
        makeTool({
          inputSchema: { type: "object", $ref: "https://evil/schema" } as never,
        }),
      ],
    });
    expect(validateManifest(manifest)).toBeNull();
  });

  it("rejects wrong siteId formats and versions", () => {
    expect(
      validateManifest(makeManifest({ siteId: "SITE_X" as never })),
    ).toBeNull();
    expect(validateManifest(makeManifest({ version: 0 }))).toBeNull();
    expect(
      validateManifest(makeManifest({ manifestVersion: 1 as never })),
    ).toBeNull();
  });
});
