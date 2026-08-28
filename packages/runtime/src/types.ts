/**
 * Runtime-local structural types. The loader deliberately imports nothing
 * from @sodium/contracts (no zod in the bundle); these mirror the manifest
 * schema and are cross-checked against contracts in tests.
 */

export interface JsonSchemaLike {
  type?: "object" | "string" | "number" | "integer" | "boolean" | "array";
  description?: string;
  properties?: Record<string, JsonSchemaLike>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchemaLike;
  enum?: (string | number)[];
  const?: string | number | boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  default?: string | number | boolean;
}

export type RiskLevel =
  "read_only" | "reversible" | "state_changing" | "destructive" | "financial";
export type ConfirmationPolicy = "none" | "recommended" | "required";

export interface RouteCondition {
  pathPattern: string;
  requiresSelector?: string;
}

export type HandlerBinding =
  | { kind: "navigate"; urlTemplate: string }
  | {
      kind: "extract";
      fields: {
        name: string;
        selector: string;
        attribute?: string;
        all?: boolean;
      }[];
    }
  | {
      kind: "form";
      formSelector: string;
      fieldMap: Record<string, string>;
      submitSelector?: string;
    }
  | { kind: "bridge"; bridgeKey: string };

export interface PublishedTool {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchemaLike;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  riskLevel: RiskLevel;
  confirmation: ConfirmationPolicy;
  routes: RouteCondition[];
  handler: HandlerBinding;
}

export interface ToolManifest {
  manifestVersion: 1;
  siteId: string;
  origins: string[];
  version: number;
  generatedAt: string;
  tools: PublishedTool[];
}

export interface SignedEnvelope {
  algorithm: "Ed25519";
  keyId: string;
  payload: string;
  signature: string;
}

/**
 * The WebMCP surface we target (W3C WebML CG draft, Aug 2026):
 * `document.modelContext` with AbortSignal-based unregistration.
 * https://webmachinelearning.github.io/webmcp/
 */
export interface WebMcpToolDescriptor {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (
    input: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>;
}

export interface ModelContextLike {
  registerTool(
    tool: WebMcpToolDescriptor,
    options?: { signal?: AbortSignal; exposedTo?: string[] },
  ): Promise<void>;
}

export interface BridgeContext {
  toolName: string;
  riskLevel: RiskLevel;
  confirmation: ConfirmationPolicy;
  signal?: AbortSignal;
}

export type BridgeHandler = (
  input: unknown,
  context: BridgeContext,
) => Promise<unknown> | unknown;

export interface BridgeRegistry {
  handlers: Map<string, BridgeHandler>;
}

declare global {
  interface Document {
    modelContext?: ModelContextLike;
  }
  interface Navigator {
    modelContext?: ModelContextLike;
  }
  interface Window {
    __sodiumBridge?: BridgeRegistry;
  }
}
