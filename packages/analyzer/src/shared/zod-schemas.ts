import type { JsonSchemaSubset } from "@sodium/contracts";
import {
  Node,
  SyntaxKind,
  type CallExpression,
  type Expression,
  type SourceFile,
} from "ts-morph";
import type { SourceSpan, ZodSchemaInfo } from "../types";

/**
 * Framework-neutral static conversion of `z.object({...})` declarations to the
 * JSON Schema subset. Purely syntactic — the customer's code is never
 * executed. Anything unrecognized degrades to a permissive `{}` schema and a
 * warning rather than a wrong guess.
 */

interface ChainLink {
  method: string;
  args: Expression[];
}

/** Unwraps `z.string().email().max(5)` into base "string" + ordered links. */
function unwrapChain(expr: Expression): {
  base: string | null;
  links: ChainLink[];
} {
  const links: ChainLink[] = [];
  let current: Expression = expr;
  while (Node.isCallExpression(current)) {
    const callee = current.getExpression();
    if (!Node.isPropertyAccessExpression(callee))
      return { base: null, links: [] };
    links.unshift({
      method: callee.getName(),
      args: [...current.getArguments()] as Expression[],
    });
    current = callee.getExpression();
  }
  // Expect the innermost expression to be the zod namespace identifier
  // (`z`) or `z.coerce`.
  const baseText = current.getText();
  if (baseText !== "z" && baseText !== "z.coerce")
    return { base: null, links: [] };
  const first = links.shift();
  if (!first) return { base: null, links: [] };
  // Keep the base call's arguments accessible via a synthetic first link;
  // convertZodExpression reads them and filters the marker out of the chain.
  return {
    base: first.method,
    links: [
      { method: `__base_args:${first.method}`, args: first.args },
      ...links,
    ],
  };
}

function literalValue(
  expr: Expression | undefined,
): string | number | boolean | null {
  if (!expr) return null;
  if (Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr))
    return expr.getLiteralValue();
  if (Node.isNumericLiteral(expr)) return expr.getLiteralValue();
  if (expr.getKind() === SyntaxKind.TrueKeyword) return true;
  if (expr.getKind() === SyntaxKind.FalseKeyword) return false;
  if (Node.isPrefixUnaryExpression(expr)) {
    const operand = expr.getOperand();
    if (
      Node.isNumericLiteral(operand) &&
      expr.getOperatorToken() === SyntaxKind.MinusToken
    ) {
      return -operand.getLiteralValue();
    }
  }
  return null;
}

export interface ConvertedProperty {
  schema: JsonSchemaSubset;
  required: boolean;
}

export function convertZodExpression(
  expr: Expression,
  warnings: string[],
  depth = 0,
): ConvertedProperty | null {
  if (depth > 6) return null;
  const { base, links } = unwrapChain(expr);
  if (!base) return null;

  let required = true;
  let schema: JsonSchemaSubset;
  const baseArgs =
    links[0]?.method === `__base_args:${base}` ? links[0].args : [];
  const chain = links.filter((l) => !l.method.startsWith("__base_args:"));

  switch (base) {
    case "string":
    case "email":
    case "url":
    case "uuid": {
      schema = { type: "string" };
      if (base === "email") schema.format = "email";
      if (base === "url") schema.format = "uri";
      if (base === "uuid") schema.format = "uuid";
      break;
    }
    case "number":
      schema = { type: "number" };
      break;
    case "boolean":
      schema = { type: "boolean" };
      break;
    case "literal": {
      const value = literalValue(baseArgs[0]);
      if (value === null) return null;
      schema = { const: value };
      break;
    }
    case "enum": {
      const arg = baseArgs[0];
      if (arg && Node.isArrayLiteralExpression(arg)) {
        const values: string[] = [];
        for (const element of arg.getElements()) {
          const value = literalValue(element as Expression);
          if (typeof value !== "string") return null;
          values.push(value);
        }
        schema = { type: "string", enum: values };
      } else {
        return null;
      }
      break;
    }
    case "array": {
      const inner = baseArgs[0]
        ? convertZodExpression(baseArgs[0], warnings, depth + 1)
        : null;
      schema = { type: "array", items: inner?.schema ?? {} };
      break;
    }
    case "object": {
      const objectResult = convertZodObjectLiteral(
        baseArgs[0],
        warnings,
        depth + 1,
      );
      if (!objectResult) return null;
      schema = objectResult;
      break;
    }
    default:
      return null;
  }

  for (const link of chain) {
    const arg0 = literalValue(link.args[0]);
    switch (link.method) {
      case "min":
        if (typeof arg0 === "number") {
          if (schema.type === "string") schema.minLength = arg0;
          else if (schema.type === "number" || schema.type === "integer")
            schema.minimum = arg0;
        }
        break;
      case "max":
        if (typeof arg0 === "number") {
          if (schema.type === "string") schema.maxLength = arg0;
          else if (schema.type === "number" || schema.type === "integer")
            schema.maximum = arg0;
        }
        break;
      case "int":
        if (schema.type === "number") schema.type = "integer";
        break;
      case "positive":
        if (schema.type === "number" || schema.type === "integer")
          schema.minimum = schema.type === "integer" ? 1 : 0;
        break;
      case "nonnegative":
        if (schema.type === "number" || schema.type === "integer")
          schema.minimum = 0;
        break;
      case "email":
        schema.format = "email";
        break;
      case "uuid":
        schema.format = "uuid";
        break;
      case "url":
        schema.format = "uri";
        break;
      case "regex": {
        const regexArg = link.args[0];
        if (regexArg && Node.isRegularExpressionLiteral(regexArg)) {
          const literal = regexArg.getLiteralText();
          const lastSlash = literal.lastIndexOf("/");
          schema.pattern = literal.slice(1, lastSlash);
        }
        break;
      }
      case "describe":
        if (typeof arg0 === "string") schema.description = arg0;
        break;
      case "optional":
      case "nullish":
        required = false;
        break;
      case "nullable":
        break;
      case "default":
        required = false;
        if (arg0 !== null) schema.default = arg0;
        break;
      case "trim":
      case "toLowerCase":
      case "toUpperCase":
      case "coerce":
        break;
      default:
        // Unknown refinement (.refine, .transform, …): keep the base type but
        // note the loss of fidelity.
        warnings.push(`zod: ignored unsupported method .${link.method}()`);
        break;
    }
  }

  return { schema, required };
}

function convertZodObjectLiteral(
  arg: Expression | undefined,
  warnings: string[],
  depth: number,
): JsonSchemaSubset | null {
  if (!arg || !Node.isObjectLiteralExpression(arg)) return null;
  const properties: Record<string, JsonSchemaSubset> = {};
  const required: string[] = [];
  for (const property of arg.getProperties()) {
    if (!Node.isPropertyAssignment(property)) {
      warnings.push("zod: skipped non-literal object property");
      continue;
    }
    const name = property.getName().replace(/^["']|["']$/g, "");
    const converted = convertZodExpression(
      property.getInitializerOrThrow(),
      warnings,
      depth,
    );
    if (!converted) {
      warnings.push(
        `zod: property "${name}" too dynamic; using permissive schema`,
      );
      properties[name] = {};
      continue;
    }
    properties[name] = converted.schema;
    if (converted.required) required.push(name);
  }
  return { type: "object", properties, required, additionalProperties: false };
}

/** Extracts every `const X = z.object({...})` (possibly chained) in a file. */
export function extractZodSchemas(
  sourceFile: SourceFile,
  filePath: string,
  warnings: string[],
): ZodSchemaInfo[] {
  const results: ZodSchemaInfo[] = [];
  for (const statement of sourceFile.getVariableStatements()) {
    for (const declaration of statement.getDeclarations()) {
      const initializer = declaration.getInitializer();
      if (!initializer || !Node.isCallExpression(initializer)) continue;
      if (!initializer.getText().startsWith("z.")) continue;
      const span: SourceSpan = {
        filePath,
        startLine: statement.getStartLineNumber(),
        endLine: statement.getEndLineNumber(),
      };
      const converted = convertZodExpression(initializer, warnings);
      results.push({
        name: declaration.getName(),
        span,
        jsonSchema:
          converted && converted.schema.type === "object"
            ? converted.schema
            : null,
      });
    }
  }
  return results;
}

/** Finds `X.parse(...)` / `X.safeParse(...)` calls and returns schema identifier names. */
export function findSchemaParseCalls(node: Node): string[] {
  const names = new Set<string>();
  for (const call of node.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  ) as CallExpression[]) {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) continue;
    const method = callee.getName();
    if (
      method !== "parse" &&
      method !== "safeParse" &&
      method !== "parseAsync" &&
      method !== "safeParseAsync"
    )
      continue;
    const target = callee.getExpression();
    if (Node.isIdentifier(target)) names.add(target.getText());
  }
  return [...names];
}
