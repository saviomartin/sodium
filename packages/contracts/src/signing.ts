/**
 * Ed25519 manifest signing. Node-only subpath (`@sodium/contracts/signing`);
 * never import from browser code. The browser verifies with WebCrypto using
 * the public JWK served alongside the loader.
 */
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import {
  canonicalJson,
  SignedManifestSchema,
  ToolManifestSchema,
  type SignedManifest,
  type ToolManifest,
} from "./manifest";

export interface SigningKey {
  keyId: string;
  /** PKCS#8 PEM private key. */
  privateKeyPem: string;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function base64UrlDecode(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "base64url"));
}

export function signManifest(
  manifest: ToolManifest,
  key: SigningKey,
): SignedManifest {
  const validated = ToolManifestSchema.parse(manifest);
  const payloadBytes = new TextEncoder().encode(canonicalJson(validated));
  const privateKey = createPrivateKey(key.privateKeyPem);
  const signature = sign(null, payloadBytes, privateKey);
  return {
    algorithm: "Ed25519",
    keyId: key.keyId,
    payload: base64UrlEncode(payloadBytes),
    signature: base64UrlEncode(new Uint8Array(signature)),
  };
}

export interface VerifyResult {
  ok: boolean;
  manifest?: ToolManifest;
  error?: string;
}

export function verifySignedManifest(
  envelope: unknown,
  publicKeyPem: string,
): VerifyResult {
  const parsed = SignedManifestSchema.safeParse(envelope);
  if (!parsed.success) return { ok: false, error: "envelope shape invalid" };
  const { payload, signature } = parsed.data;
  const payloadBytes = base64UrlDecode(payload);
  const publicKey = createPublicKey(publicKeyPem);
  const valid = verify(
    null,
    payloadBytes,
    publicKey,
    base64UrlDecode(signature),
  );
  if (!valid) return { ok: false, error: "signature invalid" };
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return { ok: false, error: "payload is not JSON" };
  }
  const manifest = ToolManifestSchema.safeParse(manifestJson);
  if (!manifest.success) return { ok: false, error: "manifest schema invalid" };
  return { ok: true, manifest: manifest.data };
}

/** Dev/test helper: generate an Ed25519 keypair (PKCS#8 / SPKI PEM). */
export function generateManifestKeyPair(keyId: string): {
  keyId: string;
  privateKeyPem: string;
  publicKeyPem: string;
  publicJwk: JsonWebKey;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    keyId,
    privateKeyPem: privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    publicJwk: publicKey.export({ format: "jwk" }) as JsonWebKey,
  };
}

/** Export an existing public key PEM as the JWK the loader consumes. */
export function publicKeyPemToJwk(publicKeyPem: string): JsonWebKey {
  return createPublicKey(publicKeyPem).export({ format: "jwk" }) as JsonWebKey;
}
