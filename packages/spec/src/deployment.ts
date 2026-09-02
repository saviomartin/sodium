import { z } from "zod";
import { DeploymentIdSchema, ProjectIdSchema } from "./ids";

export const DEPLOYMENT_RECEIPT_VERSION = 1;

const OriginSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).origin === value, {
    message: "origin must not include a path, query, or fragment",
  });

/**
 * The server signs the behavior hash and its exact allowed origins together.
 * The browser accepts tools only when this payload matches the local build.
 */
export const DeploymentReceiptPayloadSchema = z
  .object({
    receiptVersion: z.literal(DEPLOYMENT_RECEIPT_VERSION),
    projectId: ProjectIdSchema,
    deploymentId: DeploymentIdSchema,
    version: z.number().int().positive(),
    configHash: z.string().regex(/^[a-f0-9]{64}$/),
    origins: z.array(OriginSchema).min(1).max(8),
  })
  .strict();
export type DeploymentReceiptPayload = z.infer<
  typeof DeploymentReceiptPayloadSchema
>;

export const SignedDeploymentReceiptSchema = z
  .object({
    algorithm: z.literal("Ed25519"),
    keyId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9._-]+$/),
    payload: z
      .string()
      .min(1)
      .max(4096)
      .regex(/^[a-zA-Z0-9_-]+$/),
    signature: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[a-zA-Z0-9_-]+$/),
  })
  .strict();
export type SignedDeploymentReceipt = z.infer<
  typeof SignedDeploymentReceiptSchema
>;

/** Deterministic serialization for cross-runtime signing and verification. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return Object.fromEntries(
      entries.map(([key, entry]) => [key, sortKeys(entry)]),
    );
  }
  return value;
}
