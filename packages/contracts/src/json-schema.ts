import { z } from "zod";

/**
 * The constrained JSON Schema dialect allowed in tool contracts and published
 * manifests. Deliberately small: no $ref, no combinators, no remote anything.
 * The browser loader re-validates manifests against the same shape with a
 * hand-rolled validator (no zod in the loader bundle); the two implementations
 * are cross-checked in tests.
 */

export const JSON_SCHEMA_MAX_DEPTH = 5;
export const JSON_SCHEMA_MAX_PROPERTIES = 32;
export const JSON_SCHEMA_MAX_ENUM_VALUES = 64;

export interface JsonSchemaSubset {
  type?: "object" | "string" | "number" | "integer" | "boolean" | "array";
  description?: string;
  properties?: Record<string, JsonSchemaSubset>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchemaSubset;
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

export const JsonSchemaSubsetSchema: z.ZodType<JsonSchemaSubset> = z.lazy(() =>
  z
    .object({
      type: z
        .enum(["object", "string", "number", "integer", "boolean", "array"])
        .optional(),
      description: z.string().max(1024).optional(),
      properties: z
        .record(z.string().max(64), JsonSchemaSubsetSchema)
        .optional(),
      required: z.array(z.string().max(64)).optional(),
      additionalProperties: z.boolean().optional(),
      items: JsonSchemaSubsetSchema.optional(),
      enum: z
        .array(z.union([z.string().max(256), z.number()]))
        .max(JSON_SCHEMA_MAX_ENUM_VALUES)
        .optional(),
      const: z.union([z.string().max(256), z.number(), z.boolean()]).optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      minLength: z.number().int().nonnegative().optional(),
      maxLength: z.number().int().nonnegative().optional(),
      pattern: z.string().max(256).optional(),
      format: z.string().max(64).optional(),
      default: z
        .union([z.string().max(1024), z.number(), z.boolean()])
        .optional(),
    })
    .strict(),
);

/** Root schema for tool inputs: must be an object schema. */
export const ToolInputSchemaSchema = JsonSchemaSubsetSchema.refine(
  (s) =>
    s.type === "object" || (s.type === undefined && s.properties !== undefined),
  { message: "tool input schema root must be an object schema" },
);

export interface SchemaIssue {
  path: string;
  message: string;
}

/**
 * Structural limits that zod's shape check cannot express: depth and property
 * count. Returns issues rather than throwing so callers can aggregate.
 */
export function checkSchemaLimits(
  schema: JsonSchemaSubset,
  path = "$",
  depth = 1,
): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  if (depth > JSON_SCHEMA_MAX_DEPTH) {
    issues.push({
      path,
      message: `schema exceeds max depth of ${JSON_SCHEMA_MAX_DEPTH}`,
    });
    return issues;
  }
  if (schema.properties) {
    const names = Object.keys(schema.properties);
    if (names.length > JSON_SCHEMA_MAX_PROPERTIES) {
      issues.push({
        path,
        message: `schema exceeds max of ${JSON_SCHEMA_MAX_PROPERTIES} properties`,
      });
    }
    for (const name of names) {
      issues.push(
        ...checkSchemaLimits(
          schema.properties[name]!,
          `${path}.${name}`,
          depth + 1,
        ),
      );
    }
    for (const req of schema.required ?? []) {
      if (!(req in schema.properties)) {
        issues.push({
          path,
          message: `required property "${req}" is not declared`,
        });
      }
    }
  } else if (schema.required && schema.required.length > 0) {
    issues.push({ path, message: "required[] present without properties" });
  }
  if (schema.items) {
    issues.push(...checkSchemaLimits(schema.items, `${path}[]`, depth + 1));
  }
  if (schema.pattern !== undefined) {
    try {
      // Reject syntactically invalid patterns early; execution happens only in
      // the customer's browser against the customer's own inputs.
      new RegExp(schema.pattern);
    } catch {
      issues.push({ path, message: "invalid regex in pattern" });
    }
  }
  return issues;
}

/**
 * Deterministic value validation against the subset. Used by worker-side
 * evaluations and by tests that cross-check the browser validator.
 */
export function validateValue(
  schema: JsonSchemaSubset,
  value: unknown,
  path = "$",
): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const fail = (message: string) => issues.push({ path, message });

  if (schema.const !== undefined && value !== schema.const) {
    fail(`expected const ${JSON.stringify(schema.const)}`);
    return issues;
  }
  if (schema.enum && !schema.enum.some((v) => v === value)) {
    fail(`value not in enum`);
    return issues;
  }

  switch (schema.type) {
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        fail("expected object");
        return issues;
      }
      const record = value as Record<string, unknown>;
      for (const req of schema.required ?? []) {
        if (!(req in record))
          issues.push({
            path: `${path}.${req}`,
            message: "missing required property",
          });
      }
      for (const [key, propValue] of Object.entries(record)) {
        const propSchema = schema.properties?.[key];
        if (propSchema) {
          issues.push(
            ...validateValue(propSchema, propValue, `${path}.${key}`),
          );
        } else if (schema.additionalProperties === false) {
          issues.push({
            path: `${path}.${key}`,
            message: "unexpected property",
          });
        }
      }
      return issues;
    }
    case "array": {
      if (!Array.isArray(value)) {
        fail("expected array");
        return issues;
      }
      if (schema.items) {
        value.forEach((item, i) =>
          issues.push(...validateValue(schema.items!, item, `${path}[${i}]`)),
        );
      }
      return issues;
    }
    case "string": {
      if (typeof value !== "string") {
        fail("expected string");
        return issues;
      }
      if (schema.minLength !== undefined && value.length < schema.minLength)
        fail(`shorter than minLength ${schema.minLength}`);
      if (schema.maxLength !== undefined && value.length > schema.maxLength)
        fail(`longer than maxLength ${schema.maxLength}`);
      if (
        schema.pattern !== undefined &&
        !new RegExp(schema.pattern).test(value)
      )
        fail("does not match pattern");
      return issues;
    }
    case "number":
    case "integer": {
      if (typeof value !== "number" || Number.isNaN(value)) {
        fail("expected number");
        return issues;
      }
      if (schema.type === "integer" && !Number.isInteger(value))
        fail("expected integer");
      if (schema.minimum !== undefined && value < schema.minimum)
        fail(`below minimum ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum)
        fail(`above maximum ${schema.maximum}`);
      return issues;
    }
    case "boolean": {
      if (typeof value !== "boolean") fail("expected boolean");
      return issues;
    }
    default:
      // No type: only const/enum constraints applied above.
      return issues;
  }
}
