import { z } from "zod";
import {
  JsonSchemaSubsetSchema,
  type JsonSchemaSubset,
  type ToolInputSchema,
} from "./json-schema";

/**
 * `input` in sodium.json is a field map, not a JSON Schema document. Authors
 * (human or skill) write the shape they mean:
 *
 *   "input": {
 *     "q": "string",
 *     "limit": { "type": "integer", "maximum": 50, "default": 10, "optional": true }
 *   }
 *
 * Fields are REQUIRED by default. An over-required schema fails loudly (the
 * agent gets a validation error it can correct) whereas an accidentally
 * optional field passes `undefined` into a handler and fails silently, so
 * required is the safer default as well as the shorter one.
 *
 * `optional` is our only addition to the JSON Schema vocabulary. It is spelled
 * that way, rather than `required: false`, because JSON Schema already uses
 * `required` as an array on object schemas and a field may itself be an object.
 */

export const SHORT_TYPES = [
  "string",
  "number",
  "integer",
  "boolean",
] as const satisfies readonly JsonSchemaSubset["type"][];

export const ShortFieldSchema = z.enum(SHORT_TYPES);

export const AuthoredFieldSchema = z.union([
  ShortFieldSchema,
  z.intersection(
    JsonSchemaSubsetSchema,
    z.object({ optional: z.boolean().optional() }),
  ),
]);
export type AuthoredField = z.infer<typeof AuthoredFieldSchema>;

export const AuthoredInputSchema = z.record(
  z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/),
  AuthoredFieldSchema,
);
export type AuthoredInput = z.infer<typeof AuthoredInputSchema>;

/**
 * Desugars the field map into the strict object schema the SDK validates
 * against and the browser hands to `registerTool`. Pure and total: the same
 * input always produces byte-identical output, which is what lets the CLI and
 * the SDK agree without shipping the resolver twice.
 */
export function resolveInput(
  input: AuthoredInput | undefined,
): ToolInputSchema {
  const properties: Record<string, JsonSchemaSubset> = {};
  const required: string[] = [];

  for (const [name, field] of Object.entries(input ?? {})) {
    if (typeof field === "string") {
      properties[name] = { type: field };
      required.push(name);
      continue;
    }
    const { optional, ...schema } = field as JsonSchemaSubset & {
      optional?: boolean;
    };
    properties[name] = schema;
    // A field with a default is satisfiable without the agent supplying it.
    if (!optional && schema.default === undefined) required.push(name);
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

/** Property names an author declared, in authoring order. */
export function inputFieldNames(input: AuthoredInput | undefined): string[] {
  return Object.keys(input ?? {});
}
