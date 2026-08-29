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
  | {
      kind: "interaction";
      steps: InteractionStep[];
      postcondition?: InteractionPostcondition;
    }
  | {
      kind: "request";
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      pathTemplate: string;
      queryMap?: Record<string, string>;
      body?: { encoding: "json" | "form"; fieldMap: Record<string, string> };
      response: "json" | "text" | "status";
    };

export type InteractionStep =
  | { kind: "set"; selector: string; input: string }
  | { kind: "click"; selector: string }
  | { kind: "click"; role: "button"; name: string }
  | { kind: "submit"; formSelector: string; submitSelector?: string }
  | {
      kind: "wait_for";
      selector: string;
      state: "present" | "absent";
      timeoutMs: number;
    }
  | { kind: "read"; selector: string; output: string; attribute?: string };

export type InteractionPostcondition =
  | { kind: "selector_present"; selector: string }
  | { kind: "selector_absent"; selector: string }
  | { kind: "path_matches"; pathPattern: string };

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
  manifestVersion: 2;
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

declare global {
  interface Document {
    modelContext?: ModelContextLike;
  }
  interface Navigator {
    modelContext?: ModelContextLike;
  }
}
