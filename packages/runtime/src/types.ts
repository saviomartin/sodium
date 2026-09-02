export type { CompiledTool as PublishedTool } from "sodium-webmcp-spec";

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

export type InteractionPostcondition =
  | { kind: "selector_present"; selector: string }
  | { kind: "selector_absent"; selector: string }
  | { kind: "path_matches"; pathPattern: string };

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
