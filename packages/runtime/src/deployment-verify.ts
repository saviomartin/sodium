import type {
  CompiledSodiumConfig,
  DeploymentReceiptPayload,
  SodiumProject,
} from "sodium-webmcp-spec";

declare const __SODIUM_DEPLOYMENT_KEYS__: Record<string, JsonWebKey>;

const PINNED_KEYS = __SODIUM_DEPLOYMENT_KEYS__;

export type DeploymentRejection =
  | "deployment_missing"
  | "receipt_missing"
  | "receipt_shape"
  | "unknown_key"
  | "webcrypto_unavailable"
  | "signature_invalid"
  | "payload_invalid"
  | "deployment_mismatch"
  | "config_mismatch"
  | "origin_mismatch";

export type DeploymentVerification =
  | { ok: true; payload: DeploymentReceiptPayload }
  | { ok: false; error: DeploymentRejection };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: string[],
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    expected.sort().every((key, index) => actual[index] === key)
  );
}

function base64UrlToBytes(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function validPayload(value: unknown): DeploymentReceiptPayload | null {
  if (!isRecord(value)) return null;
  if (
    !exactKeys(value, [
      "configHash",
      "deploymentId",
      "origins",
      "projectId",
      "receiptVersion",
      "version",
    ]) ||
    value.receiptVersion !== 1 ||
    typeof value.projectId !== "string" ||
    !/^prj_[a-z0-9]{8,24}$/.test(value.projectId) ||
    typeof value.deploymentId !== "string" ||
    !/^dep_[a-z0-9]{12,24}$/.test(value.deploymentId) ||
    typeof value.version !== "number" ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    typeof value.configHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.configHash) ||
    !Array.isArray(value.origins) ||
    value.origins.length < 1 ||
    value.origins.length > 8 ||
    !value.origins.every((origin) => {
      if (typeof origin !== "string") return false;
      try {
        return new URL(origin).origin === origin;
      } catch {
        return false;
      }
    })
  ) {
    return null;
  }
  return value as DeploymentReceiptPayload;
}

async function hashCompiledConfig(
  config: CompiledSodiumConfig,
  cryptoObj: Crypto,
): Promise<string | null> {
  try {
    const digest = await cryptoObj.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(config)),
    );
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  } catch {
    return null;
  }
}

export async function verifyDeployment(
  config: CompiledSodiumConfig,
  project: SodiumProject | null | undefined,
  currentOrigin: string,
  cryptoObj: Crypto,
  keys: Record<string, JsonWebKey> = PINNED_KEYS,
): Promise<DeploymentVerification> {
  const deployment = project?.deployment;
  if (!project || !deployment)
    return { ok: false, error: "deployment_missing" };
  const receipt = deployment.receipt;
  if (!receipt) return { ok: false, error: "receipt_missing" };
  if (
    !isRecord(receipt) ||
    !exactKeys(receipt, ["algorithm", "keyId", "payload", "signature"]) ||
    receipt.algorithm !== "Ed25519" ||
    typeof receipt.keyId !== "string" ||
    !/^[a-zA-Z0-9._-]{1,64}$/.test(receipt.keyId) ||
    typeof receipt.payload !== "string" ||
    receipt.payload.length < 1 ||
    receipt.payload.length > 4096 ||
    !/^[a-zA-Z0-9_-]+$/.test(receipt.payload) ||
    typeof receipt.signature !== "string" ||
    receipt.signature.length < 1 ||
    receipt.signature.length > 256 ||
    !/^[a-zA-Z0-9_-]+$/.test(receipt.signature)
  ) {
    return { ok: false, error: "receipt_shape" };
  }
  const publicKey = keys[receipt.keyId];
  if (!publicKey) return { ok: false, error: "unknown_key" };
  if (!cryptoObj?.subtle) return { ok: false, error: "webcrypto_unavailable" };

  let payloadBytes: Uint8Array;
  let signatureBytes: Uint8Array;
  try {
    payloadBytes = base64UrlToBytes(receipt.payload);
    signatureBytes = base64UrlToBytes(receipt.signature);
  } catch {
    return { ok: false, error: "receipt_shape" };
  }

  try {
    const key = await cryptoObj.subtle.importKey(
      "jwk",
      publicKey,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const valid = await cryptoObj.subtle.verify(
      { name: "Ed25519" },
      key,
      signatureBytes as unknown as BufferSource,
      payloadBytes as unknown as BufferSource,
    );
    if (!valid) return { ok: false, error: "signature_invalid" };
  } catch {
    return { ok: false, error: "signature_invalid" };
  }

  let payload: DeploymentReceiptPayload | null = null;
  try {
    payload = validPayload(JSON.parse(new TextDecoder().decode(payloadBytes)));
  } catch {
    // Invalid JSON fails closed below.
  }
  if (!payload) return { ok: false, error: "payload_invalid" };
  if (
    payload.projectId !== project.projectId ||
    payload.deploymentId !== deployment.id ||
    payload.version !== deployment.version ||
    payload.configHash !== deployment.configHash
  ) {
    return { ok: false, error: "deployment_mismatch" };
  }
  const hash = await hashCompiledConfig(config, cryptoObj);
  if (!hash || hash !== payload.configHash)
    return { ok: false, error: "config_mismatch" };
  if (
    JSON.stringify(payload.origins) !== JSON.stringify(config.app.origins) ||
    !payload.origins.includes(currentOrigin)
  ) {
    return { ok: false, error: "origin_mismatch" };
  }
  return { ok: true, payload };
}
