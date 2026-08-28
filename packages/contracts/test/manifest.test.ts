import { describe, expect, it } from "vitest";
import { canonicalJson, ToolManifestSchema } from "../src/index";
import {
  generateManifestKeyPair,
  signManifest,
  verifySignedManifest,
} from "../src/signing";
import { makeManifest } from "./fixtures";

describe("canonicalJson", () => {
  it("sorts keys deterministically and drops undefined", () => {
    expect(
      canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: undefined } }),
    ).toBe('{"a":{"d":[2,{"y":2,"z":1}]},"b":1}');
  });
});

describe("manifest schema", () => {
  it("accepts a valid manifest", () => {
    expect(ToolManifestSchema.safeParse(makeManifest()).success).toBe(true);
  });

  it("rejects duplicate tool names", () => {
    const manifest = makeManifest();
    const dupe = {
      ...manifest,
      tools: [manifest.tools[0]!, manifest.tools[0]!],
    };
    expect(ToolManifestSchema.safeParse(dupe).success).toBe(false);
  });

  it("rejects unknown handler kinds (no executable payloads)", () => {
    const manifest = makeManifest();
    const evil = {
      ...manifest,
      tools: [
        {
          ...manifest.tools[0]!,
          handler: { kind: "script", code: "alert(1)" },
        },
      ],
    };
    expect(ToolManifestSchema.safeParse(evil).success).toBe(false);
  });

  it("rejects extra properties smuggled into tools", () => {
    const manifest = makeManifest();
    const evil = {
      ...manifest,
      tools: [{ ...manifest.tools[0]!, onInvoke: "javascript:alert(1)" }],
    };
    expect(ToolManifestSchema.safeParse(evil).success).toBe(false);
  });
});

describe("signing", () => {
  const key = generateManifestKeyPair("key_test");

  it("round-trips sign/verify", () => {
    const signed = signManifest(makeManifest(), {
      keyId: key.keyId,
      privateKeyPem: key.privateKeyPem,
    });
    const verified = verifySignedManifest(signed, key.publicKeyPem);
    expect(verified.ok).toBe(true);
    expect(verified.manifest?.siteId).toBe("site_abcd1234efgh");
  });

  it("rejects tampered payloads", () => {
    const signed = signManifest(makeManifest(), {
      keyId: key.keyId,
      privateKeyPem: key.privateKeyPem,
    });
    const tamperedManifest = makeManifest({ version: 2 });
    const tampered = {
      ...signed,
      payload: Buffer.from(canonicalJson(tamperedManifest)).toString(
        "base64url",
      ),
    };
    expect(verifySignedManifest(tampered, key.publicKeyPem).ok).toBe(false);
  });

  it("rejects signatures from a different key", () => {
    const otherKey = generateManifestKeyPair("key_other");
    const signed = signManifest(makeManifest(), {
      keyId: otherKey.keyId,
      privateKeyPem: otherKey.privateKeyPem,
    });
    expect(verifySignedManifest(signed, key.publicKeyPem).ok).toBe(false);
  });

  it("rejects garbage envelopes", () => {
    expect(
      verifySignedManifest(
        { algorithm: "none", payload: "x" },
        key.publicKeyPem,
      ).ok,
    ).toBe(false);
    expect(verifySignedManifest(null, key.publicKeyPem).ok).toBe(false);
  });
});
