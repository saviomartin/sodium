import type { JsonSchemaLike } from "./types";

/**
 * Deterministic input validation against the config's JSON-Schema subset,
 * run before any handler executes. Mirrors the spec's validateValue;
 * the two are cross-checked in tests.
 */
export function validateInput(
  schema: JsonSchemaLike,
  value: unknown,
  path = "$",
): string[] {
  const issues: string[] = [];
  const fail = (message: string) => issues.push(`${path}: ${message}`);

  if (schema.const !== undefined && value !== schema.const) {
    fail("expected const value");
    return issues;
  }
  if (schema.enum && !schema.enum.some((candidate) => candidate === value)) {
    fail("value not in enum");
    return issues;
  }

  switch (schema.type) {
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value))
        return [...issues, `${path}: expected object`];
      const record = value as Record<string, unknown>;
      for (const required of schema.required ?? []) {
        if (!(required in record))
          issues.push(`${path}.${required}: missing required property`);
      }
      for (const [key, propValue] of Object.entries(record)) {
        const propSchema = schema.properties?.[key];
        if (propSchema)
          issues.push(
            ...validateInput(propSchema, propValue, `${path}.${key}`),
          );
        else if (schema.additionalProperties === false)
          issues.push(`${path}.${key}: unexpected property`);
      }
      return issues;
    }
    case "array": {
      if (!Array.isArray(value)) return [...issues, `${path}: expected array`];
      if (schema.items)
        value.forEach((item, i) =>
          issues.push(...validateInput(schema.items!, item, `${path}[${i}]`)),
        );
      return issues;
    }
    case "string": {
      if (typeof value !== "string")
        return [...issues, `${path}: expected string`];
      if (schema.minLength !== undefined && value.length < schema.minLength)
        fail("below minLength");
      if (schema.maxLength !== undefined && value.length > schema.maxLength)
        fail("above maxLength");
      if (schema.pattern !== undefined) {
        try {
          if (!new RegExp(schema.pattern).test(value)) fail("pattern mismatch");
        } catch {
          fail("invalid pattern");
        }
      }
      return issues;
    }
    case "number":
    case "integer": {
      if (typeof value !== "number" || Number.isNaN(value))
        return [...issues, `${path}: expected number`];
      if (schema.type === "integer" && !Number.isInteger(value))
        fail("expected integer");
      if (schema.minimum !== undefined && value < schema.minimum)
        fail("below minimum");
      if (schema.maximum !== undefined && value > schema.maximum)
        fail("above maximum");
      return issues;
    }
    case "boolean": {
      if (typeof value !== "boolean") fail("expected boolean");
      return issues;
    }
    default:
      return issues;
  }
}
