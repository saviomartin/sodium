import { z } from "zod";
import { ActionIdSchema, ToolNameSchema } from "./ids";
import { ConfirmationPolicySchema, RiskLevelSchema } from "./risk";
import { EvidenceSchema } from "./evidence";
import { JsonSchemaSubsetSchema, ToolInputSchemaSchema } from "./json-schema";

/**
 * Handler bindings describe HOW the runtime executes an approved action.
 * Only declarative data crosses the wire — never JavaScript. Complex actions
 * bind to `bridge` handlers that live in the customer's own repository.
 */

export const NavigateHandlerSchema = z
  .object({
    kind: z.literal("navigate"),
    /** Path template with `{param}` placeholders resolved from tool input. */
    urlTemplate: z
      .string()
      .max(1024)
      .regex(/^\//, "urlTemplate must be a same-origin path"),
  })
  .strict();

export const ExtractFieldSchema = z
  .object({
    name: z.string().max(64),
    selector: z.string().max(512),
    /** Attribute to read; defaults to trimmed text content. */
    attribute: z.string().max(64).optional(),
    /** Collect every match instead of the first. */
    all: z.boolean().optional(),
  })
  .strict();

export const ExtractHandlerSchema = z
  .object({
    kind: z.literal("extract"),
    fields: z.array(ExtractFieldSchema).min(1).max(32),
  })
  .strict();

export const FormHandlerSchema = z
  .object({
    kind: z.literal("form"),
    formSelector: z.string().max(512),
    /** Maps tool input property -> form control `name` attribute. */
    fieldMap: z.record(z.string().max(64), z.string().max(128)),
    submitSelector: z.string().max(512).optional(),
  })
  .strict();

export const BridgeHandlerSchema = z
  .object({
    kind: z.literal("bridge"),
    /** Key the customer's generated action bridge registers, e.g. "orders.cancel". */
    bridgeKey: z
      .string()
      .max(128)
      .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/),
  })
  .strict();

export const HandlerBindingSchema = z.discriminatedUnion("kind", [
  NavigateHandlerSchema,
  ExtractHandlerSchema,
  FormHandlerSchema,
  BridgeHandlerSchema,
]);
export type HandlerBinding = z.infer<typeof HandlerBindingSchema>;

/** Where and when a tool should be registered on the customer's site. */
export const RouteConditionSchema = z
  .object({
    /** Path pattern: literal segments plus `*` (one segment) and `**` (rest). */
    pathPattern: z
      .string()
      .max(512)
      .regex(/^\//, "pathPattern must start with /"),
    /** Only register when this selector exists (e.g. an authenticated shell). */
    requiresSelector: z.string().max(512).optional(),
  })
  .strict();
export type RouteCondition = z.infer<typeof RouteConditionSchema>;

export const AuthRequirementSchema = z
  .object({
    required: z.boolean(),
    /** Application roles allowed to invoke the underlying behavior, if known. */
    roles: z.array(z.string().max(64)).max(16).default([]),
    /** Human-readable note on how auth was detected (evidence, not enforcement). */
    detectedFrom: z.string().max(500).optional(),
  })
  .strict();

export const OutputDefinitionSchema = z
  .object({
    description: z.string().max(1024),
    schema: JsonSchemaSubsetSchema.optional(),
  })
  .strict();

export const CANDIDATE_STATUSES = [
  "proposed",
  "needs_review",
  "approved",
  "rejected",
  "published",
] as const;
export const CandidateStatusSchema = z.enum(CANDIDATE_STATUSES);
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;

export const CONTRACT_VERSION = 1;

/**
 * The transport-neutral action contract. WebMCP is one projection of this
 * (see manifest.ts); future MCP or commerce adapters project the same data.
 */
export const ActionContractSchema = z
  .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    actionId: ActionIdSchema,
    name: ToolNameSchema,
    title: z.string().min(3).max(120),
    description: z.string().min(10).max(1024),
    inputSchema: ToolInputSchemaSchema,
    output: OutputDefinitionSchema,
    evidence: z.array(EvidenceSchema).max(64),
    routes: z.array(RouteConditionSchema).min(1).max(16),
    auth: AuthRequirementSchema,
    riskLevel: RiskLevelSchema,
    confirmation: ConfirmationPolicySchema,
    handler: HandlerBindingSchema,
    /** Calibrated 0..1; deterministic validation can only lower it. */
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type ActionContract = z.infer<typeof ActionContractSchema>;
