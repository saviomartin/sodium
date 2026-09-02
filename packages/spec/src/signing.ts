import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import {
  canonicalJson,
  DeploymentReceiptPayloadSchema,
  SignedDeploymentReceiptSchema,
  type DeploymentReceiptPayload,
  type SignedDeploymentReceipt,
} from "./deployment";

export interface DeploymentSigningKey {
  keyId: string;
  /** PKCS#8 PEM private key. */
  privateKeyPem: string;
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlDecode(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "base64url"));
}

export function signDeploymentReceipt(
  payload: DeploymentReceiptPayload,
  key: DeploymentSigningKey,
): SignedDeploymentReceipt {
  const validated = DeploymentReceiptPayloadSchema.parse(payload);
  const payloadBytes = new TextEncoder().encode(canonicalJson(validated));
  const signature = sign(
    null,
    payloadBytes,
    createPrivateKey(key.privateKeyPem),
  );
  return SignedDeploymentReceiptSchema.parse({
    algorithm: "Ed25519",
    keyId: key.keyId,
    payload: base64UrlEncode(payloadBytes),
    signature: base64UrlEncode(new Uint8Array(signature)),
  });
}

export function verifySignedDeploymentReceipt(
  receipt: unknown,
  publicKeyPem: string,
): DeploymentReceiptPayload | null {
  const parsed = SignedDeploymentReceiptSchema.safeParse(receipt);
  if (!parsed.success) return null;
  const payloadBytes = base64UrlDecode(parsed.data.payload);
  const valid = verify(
    null,
    payloadBytes,
    createPublicKey(publicKeyPem),
    base64UrlDecode(parsed.data.signature),
  );
  if (!valid) return null;
  try {
    return DeploymentReceiptPayloadSchema.parse(
      JSON.parse(new TextDecoder().decode(payloadBytes)),
    );
  } catch {
    return null;
  }
}

export function generateDeploymentKeyPair(keyId: string): {
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
