import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "../lib/webhook-verify";

const SECRET = "test-webhook-secret";

function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({ action: "opened", repository: { id: 42 } });

  it("accepts a valid signature", () => {
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a signature computed with a different secret", () => {
    expect(
      verifyWebhookSignature(body, sign(body, "wrong-secret"), SECRET),
    ).toBe(false);
  });

  it("rejects a signature for a different body (tampered payload)", () => {
    expect(verifyWebhookSignature(body + " ", sign(body), SECRET)).toBe(false);
  });

  it("rejects missing, malformed and wrong-scheme headers", () => {
    expect(verifyWebhookSignature(body, null, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "", SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "sha1=abcdef", SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=nothex!", SECRET)).toBe(false);
    expect(
      verifyWebhookSignature(body, "sha256=" + "a".repeat(63), SECRET),
    ).toBe(false);
  });
});
