import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * GitHub webhook signature verification (X-Hub-Signature-256):
 * HMAC-SHA256 over the RAW request body with the webhook secret, compared
 * timing-safely. Pure module — unit-tested directly.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(provided, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}
