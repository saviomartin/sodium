import { describe, expect, it } from "vitest";
import {
  DEPLOYMENT_RECEIPT_VERSION,
  type DeploymentReceiptPayload,
} from "../src";
import {
  generateDeploymentKeyPair,
  signDeploymentReceipt,
  verifySignedDeploymentReceipt,
} from "../src/signing";

const payload: DeploymentReceiptPayload = {
  receiptVersion: DEPLOYMENT_RECEIPT_VERSION,
  projectId: "prj_abcdefghijkl",
  deploymentId: "dep_abcdefghijklmnop",
  version: 3,
  configHash: "a".repeat(64),
  origins: ["https://app.example"],
};

describe("signed deployment receipts", () => {
  const key = generateDeploymentKeyPair("key_test");

  it("round-trips an exact deployment payload", () => {
    const receipt = signDeploymentReceipt(payload, key);
    expect(verifySignedDeploymentReceipt(receipt, key.publicKeyPem)).toEqual(
      payload,
    );
  });

  it("rejects a tampered payload and a different signing key", () => {
    const receipt = signDeploymentReceipt(payload, key);
    const tampered = {
      ...receipt,
      payload: signDeploymentReceipt({ ...payload, version: 4 }, key).payload,
    };
    expect(
      verifySignedDeploymentReceipt(tampered, key.publicKeyPem),
    ).toBeNull();

    const other = generateDeploymentKeyPair("key_other");
    expect(
      verifySignedDeploymentReceipt(receipt, other.publicKeyPem),
    ).toBeNull();
  });
});
