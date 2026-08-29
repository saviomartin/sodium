import type {
  HandlerBinding,
  JsonSchemaLike,
  PublishedTool,
  SignedEnvelope,
  ToolManifest,
} from "./types";

/**
 * Fail-closed manifest verification for the browser loader:
 *  1. Ed25519 signature over the exact payload bytes (WebCrypto, pinned JWKs)
 *  2. strict structural validation — unknown handler kinds, extra keys on
 *     security-relevant objects, oversized collections and non-declarative
 *     content are all rejected.
 * No zod here by design: the loader must stay tiny and dependency-free.
 */

const TOOL_NAME = /^[a-z][a-z0-9_]{1,63}$/;
const SITE_ID = /^site_[a-z0-9]{8,32}$/;
const RISKS = new Set([
  "read_only",
  "reversible",
  "state_changing",
  "destructive",
  "financial",
]);
const CONFIRMATIONS = new Set(["none", "recommended", "required"]);

export function base64UrlToBytes(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function verifyEnvelope(
  envelope: unknown,
  keys: Record<string, JsonWebKey>,
  cryptoObj: Crypto = globalThis.crypto,
): Promise<
  { ok: true; manifest: ToolManifest } | { ok: false; error: string }
> {
  if (typeof envelope !== "object" || envelope === null)
    return { ok: false, error: "envelope_not_object" };
  const e = envelope as Partial<SignedEnvelope>;
  if (
    e.algorithm !== "Ed25519" ||
    typeof e.keyId !== "string" ||
    typeof e.payload !== "string" ||
    typeof e.signature !== "string"
  ) {
    return { ok: false, error: "envelope_shape" };
  }
  const jwk = keys[e.keyId];
  if (!jwk) return { ok: false, error: "unknown_key" };
  if (!cryptoObj?.subtle) return { ok: false, error: "no_webcrypto" };

  let payloadBytes: Uint8Array;
  let signatureBytes: Uint8Array;
  try {
    payloadBytes = base64UrlToBytes(e.payload);
    signatureBytes = base64UrlToBytes(e.signature);
  } catch {
    return { ok: false, error: "bad_base64" };
  }

  let valid: boolean;
  try {
    const key = await cryptoObj.subtle.importKey(
      "jwk",
      jwk,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    valid = await cryptoObj.subtle.verify(
      { name: "Ed25519" },
      key,
      signatureBytes as unknown as BufferSource,
      payloadBytes as unknown as BufferSource,
    );
  } catch {
    return { ok: false, error: "ed25519_unsupported" };
  }
  if (!valid) return { ok: false, error: "bad_signature" };

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return { ok: false, error: "payload_not_json" };
  }
  const manifest = validateManifest(json);
  if (!manifest) return { ok: false, error: "manifest_invalid" };
  return { ok: true, manifest };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateManifest(value: unknown): ToolManifest | null {
  if (!isRecord(value)) return null;
  if (value.manifestVersion !== 2) return null;
  if (typeof value.siteId !== "string" || !SITE_ID.test(value.siteId))
    return null;
  if (
    !Array.isArray(value.origins) ||
    value.origins.length === 0 ||
    value.origins.length > 8
  )
    return null;
  if (
    !value.origins.every((o) => typeof o === "string" && /^https?:\/\//.test(o))
  )
    return null;
  if (
    typeof value.version !== "number" ||
    !Number.isInteger(value.version) ||
    value.version < 1
  )
    return null;
  if (typeof value.generatedAt !== "string") return null;
  if (!Array.isArray(value.tools) || value.tools.length > 128) return null;

  const tools: PublishedTool[] = [];
  const names = new Set<string>();
  for (const raw of value.tools) {
    const tool = validateTool(raw);
    if (!tool) return null;
    if (names.has(tool.name)) return null;
    names.add(tool.name);
    tools.push(tool);
  }
  return {
    manifestVersion: 2,
    siteId: value.siteId,
    origins: value.origins as string[],
    version: value.version,
    generatedAt: value.generatedAt,
    tools,
  };
}

function validateTool(value: unknown): PublishedTool | null {
  if (!isRecord(value)) return null;
  if (typeof value.name !== "string" || !TOOL_NAME.test(value.name))
    return null;
  if (
    typeof value.title !== "string" ||
    value.title.length < 3 ||
    value.title.length > 120
  )
    return null;
  if (
    typeof value.description !== "string" ||
    value.description.length < 10 ||
    value.description.length > 1024
  )
    return null;
  if (typeof value.riskLevel !== "string" || !RISKS.has(value.riskLevel))
    return null;
  if (
    typeof value.confirmation !== "string" ||
    !CONFIRMATIONS.has(value.confirmation)
  )
    return null;

  const annotations = value.annotations;
  if (!isRecord(annotations)) return null;
  for (const hint of [
    "readOnlyHint",
    "destructiveHint",
    "idempotentHint",
    "openWorldHint",
  ]) {
    if (typeof annotations[hint] !== "boolean") return null;
  }

  const inputSchema = validateSchema(value.inputSchema, 1);
  if (!inputSchema || inputSchema.type !== "object") return null;

  if (
    !Array.isArray(value.routes) ||
    value.routes.length === 0 ||
    value.routes.length > 16
  )
    return null;
  const routes = [];
  for (const raw of value.routes) {
    if (!isRecord(raw)) return null;
    if (
      typeof raw.pathPattern !== "string" ||
      !raw.pathPattern.startsWith("/") ||
      raw.pathPattern.length > 512
    )
      return null;
    if (
      raw.requiresSelector !== undefined &&
      (typeof raw.requiresSelector !== "string" ||
        raw.requiresSelector.length > 512)
    )
      return null;
    routes.push({
      pathPattern: raw.pathPattern,
      requiresSelector: raw.requiresSelector as string | undefined,
    });
  }

  const handler = validateHandler(value.handler);
  if (!handler) return null;

  return {
    name: value.name,
    title: value.title,
    description: value.description,
    inputSchema,
    annotations: {
      readOnlyHint: annotations.readOnlyHint as boolean,
      destructiveHint: annotations.destructiveHint as boolean,
      idempotentHint: annotations.idempotentHint as boolean,
      openWorldHint: annotations.openWorldHint as boolean,
    },
    riskLevel: value.riskLevel as PublishedTool["riskLevel"],
    confirmation: value.confirmation as PublishedTool["confirmation"],
    routes,
    handler,
  };
}

function validateHandler(value: unknown): HandlerBinding | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case "navigate": {
      if (
        typeof value.urlTemplate !== "string" ||
        !value.urlTemplate.startsWith("/") ||
        value.urlTemplate.length > 1024
      )
        return null;
      // Same-origin path only; refuse protocol-relative ("//host") templates.
      if (value.urlTemplate.startsWith("//")) return null;
      if (Object.keys(value).length !== 2) return null;
      return { kind: "navigate", urlTemplate: value.urlTemplate };
    }
    case "extract": {
      if (
        !Array.isArray(value.fields) ||
        value.fields.length === 0 ||
        value.fields.length > 32
      )
        return null;
      const fields = [];
      for (const raw of value.fields) {
        if (!isRecord(raw)) return null;
        if (typeof raw.name !== "string" || raw.name.length > 64) return null;
        if (typeof raw.selector !== "string" || raw.selector.length > 512)
          return null;
        if (
          raw.attribute !== undefined &&
          (typeof raw.attribute !== "string" ||
            raw.attribute.length > 64 ||
            /^on/i.test(raw.attribute))
        )
          return null;
        if (raw.all !== undefined && typeof raw.all !== "boolean") return null;
        fields.push({
          name: raw.name,
          selector: raw.selector,
          attribute: raw.attribute as string | undefined,
          all: raw.all as boolean | undefined,
        });
      }
      if (Object.keys(value).length !== 2) return null;
      return { kind: "extract", fields };
    }
    case "form": {
      if (
        typeof value.formSelector !== "string" ||
        value.formSelector.length > 512
      )
        return null;
      if (!isRecord(value.fieldMap)) return null;
      const fieldMap: Record<string, string> = {};
      for (const [key, mapped] of Object.entries(value.fieldMap)) {
        if (
          typeof mapped !== "string" ||
          key.length > 64 ||
          mapped.length > 128
        )
          return null;
        fieldMap[key] = mapped;
      }
      if (
        value.submitSelector !== undefined &&
        (typeof value.submitSelector !== "string" ||
          value.submitSelector.length > 512)
      )
        return null;
      const allowedKeys = value.submitSelector === undefined ? 3 : 4;
      if (Object.keys(value).length > allowedKeys) return null;
      return {
        kind: "form",
        formSelector: value.formSelector,
        fieldMap,
        submitSelector: value.submitSelector as string | undefined,
      };
    }
    case "interaction": {
      if (
        !Array.isArray(value.steps) ||
        value.steps.length === 0 ||
        value.steps.length > 8
      )
        return null;
      const steps: Extract<HandlerBinding, { kind: "interaction" }>["steps"] =
        [];
      for (const raw of value.steps) {
        if (!isRecord(raw) || typeof raw.kind !== "string") return null;
        if (raw.kind === "set") {
          if (
            !validSelector(raw.selector) ||
            !validName(raw.input) ||
            Object.keys(raw).length !== 3
          )
            return null;
          steps.push({
            kind: "set",
            selector: raw.selector as string,
            input: raw.input as string,
          });
        } else if (raw.kind === "click") {
          if (raw.selector !== undefined) {
            if (!validSelector(raw.selector) || Object.keys(raw).length !== 2)
              return null;
            steps.push({ kind: "click", selector: raw.selector as string });
          } else {
            if (
              raw.role !== "button" ||
              typeof raw.name !== "string" ||
              raw.name.length === 0 ||
              raw.name.length > 160 ||
              Object.keys(raw).length !== 3
            )
              return null;
            steps.push({ kind: "click", role: "button", name: raw.name });
          }
        } else if (raw.kind === "submit") {
          if (
            !validSelector(raw.formSelector) ||
            (raw.submitSelector !== undefined &&
              !validSelector(raw.submitSelector))
          )
            return null;
          if (
            Object.keys(raw).length !==
            (raw.submitSelector === undefined ? 2 : 3)
          )
            return null;
          steps.push({
            kind: "submit",
            formSelector: raw.formSelector as string,
            submitSelector: raw.submitSelector as string | undefined,
          });
        } else if (raw.kind === "wait_for") {
          if (
            !validSelector(raw.selector) ||
            (raw.state !== "present" && raw.state !== "absent") ||
            typeof raw.timeoutMs !== "number" ||
            !Number.isInteger(raw.timeoutMs) ||
            raw.timeoutMs < 50 ||
            raw.timeoutMs > 10_000 ||
            Object.keys(raw).length !== 4
          )
            return null;
          steps.push({
            kind: "wait_for",
            selector: raw.selector as string,
            state: raw.state,
            timeoutMs: raw.timeoutMs,
          });
        } else if (raw.kind === "read") {
          if (
            !validSelector(raw.selector) ||
            !validName(raw.output) ||
            (raw.attribute !== undefined &&
              (typeof raw.attribute !== "string" ||
                raw.attribute.length > 64 ||
                /^on/i.test(raw.attribute)))
          )
            return null;
          if (Object.keys(raw).length !== (raw.attribute === undefined ? 3 : 4))
            return null;
          steps.push({
            kind: "read",
            selector: raw.selector as string,
            output: raw.output as string,
            attribute: raw.attribute as string | undefined,
          });
        } else return null;
      }
      let postcondition: Extract<
        HandlerBinding,
        { kind: "interaction" }
      >["postcondition"];
      if (value.postcondition !== undefined) {
        const raw = value.postcondition;
        if (!isRecord(raw) || Object.keys(raw).length !== 2) return null;
        if (raw.kind === "selector_present" || raw.kind === "selector_absent") {
          if (!validSelector(raw.selector)) return null;
          postcondition = { kind: raw.kind, selector: raw.selector as string };
        } else if (raw.kind === "path_matches") {
          if (
            typeof raw.pathPattern !== "string" ||
            !raw.pathPattern.startsWith("/") ||
            raw.pathPattern.length > 512
          )
            return null;
          postcondition = {
            kind: "path_matches",
            pathPattern: raw.pathPattern,
          };
        } else return null;
      }
      if (
        Object.keys(value).length !==
        (value.postcondition === undefined ? 2 : 3)
      )
        return null;
      return { kind: "interaction", steps, postcondition };
    }
    case "request": {
      if (
        !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(
          String(value.method),
        )
      )
        return null;
      if (
        typeof value.pathTemplate !== "string" ||
        !value.pathTemplate.startsWith("/") ||
        value.pathTemplate.startsWith("//") ||
        value.pathTemplate.length > 1024
      )
        return null;
      if (!validateStringMap(value.queryMap, true)) return null;
      let body: Extract<HandlerBinding, { kind: "request" }>["body"];
      if (value.body !== undefined) {
        if (
          !isRecord(value.body) ||
          (value.body.encoding !== "json" && value.body.encoding !== "form") ||
          !validateStringMap(value.body.fieldMap, false) ||
          Object.keys(value.body).length !== 2
        )
          return null;
        if (value.method === "GET" || value.method === "DELETE") return null;
        body = {
          encoding: value.body.encoding,
          fieldMap: value.body.fieldMap as Record<string, string>,
        };
      }
      if (
        value.response !== "json" &&
        value.response !== "text" &&
        value.response !== "status"
      )
        return null;
      const allowed =
        4 +
        (value.queryMap === undefined ? 0 : 1) +
        (value.body === undefined ? 0 : 1);
      if (Object.keys(value).length !== allowed) return null;
      return {
        kind: "request",
        method: value.method as Extract<
          HandlerBinding,
          { kind: "request" }
        >["method"],
        pathTemplate: value.pathTemplate,
        queryMap: value.queryMap as Record<string, string> | undefined,
        body,
        response: value.response,
      };
    }
    default:
      // Unknown handler kinds (including anything resembling executable
      // content) fail the whole manifest.
      return null;
  }
}

function validSelector(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function validName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}

function validateStringMap(value: unknown, optional: boolean): boolean {
  if (value === undefined) return optional;
  if (!isRecord(value)) return false;
  return Object.entries(value).every(
    ([key, mapped]) =>
      key.length > 0 &&
      key.length <= 64 &&
      typeof mapped === "string" &&
      mapped.length > 0 &&
      mapped.length <= 128,
  );
}

const SCHEMA_KEYS = new Set([
  "type",
  "description",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "default",
]);
const SCHEMA_TYPES = new Set([
  "object",
  "string",
  "number",
  "integer",
  "boolean",
  "array",
]);

export function validateSchema(
  value: unknown,
  depth: number,
): JsonSchemaLike | null {
  if (depth > 5) return null;
  if (!isRecord(value)) return null;
  for (const key of Object.keys(value)) {
    if (!SCHEMA_KEYS.has(key)) return null;
  }
  if (
    value.type !== undefined &&
    (typeof value.type !== "string" || !SCHEMA_TYPES.has(value.type))
  )
    return null;
  const result: JsonSchemaLike = {};
  if (value.type !== undefined)
    result.type = value.type as JsonSchemaLike["type"];
  if (value.description !== undefined) {
    if (
      typeof value.description !== "string" ||
      value.description.length > 1024
    )
      return null;
    result.description = value.description;
  }
  if (value.properties !== undefined) {
    if (
      !isRecord(value.properties) ||
      Object.keys(value.properties).length > 32
    )
      return null;
    const properties: Record<string, JsonSchemaLike> = {};
    for (const [name, propSchema] of Object.entries(value.properties)) {
      if (name.length > 64) return null;
      const validated = validateSchema(propSchema, depth + 1);
      if (!validated) return null;
      properties[name] = validated;
    }
    result.properties = properties;
  }
  if (value.required !== undefined) {
    if (
      !Array.isArray(value.required) ||
      !value.required.every((r) => typeof r === "string" && r.length <= 64)
    )
      return null;
    result.required = value.required as string[];
  }
  if (value.additionalProperties !== undefined) {
    if (typeof value.additionalProperties !== "boolean") return null;
    result.additionalProperties = value.additionalProperties;
  }
  if (value.items !== undefined) {
    const items = validateSchema(value.items, depth + 1);
    if (!items) return null;
    result.items = items;
  }
  if (value.enum !== undefined) {
    if (
      !Array.isArray(value.enum) ||
      value.enum.length > 64 ||
      !value.enum.every((v) => typeof v === "string" || typeof v === "number")
    )
      return null;
    result.enum = value.enum as (string | number)[];
  }
  for (const numeric of [
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
  ] as const) {
    if (value[numeric] !== undefined) {
      if (typeof value[numeric] !== "number") return null;
      result[numeric] = value[numeric];
    }
  }
  if (value.const !== undefined) {
    if (!["string", "number", "boolean"].includes(typeof value.const))
      return null;
    result.const = value.const as JsonSchemaLike["const"];
  }
  if (value.pattern !== undefined) {
    if (typeof value.pattern !== "string" || value.pattern.length > 256)
      return null;
    result.pattern = value.pattern;
  }
  if (value.format !== undefined) {
    if (typeof value.format !== "string" || value.format.length > 64)
      return null;
    result.format = value.format;
  }
  if (value.default !== undefined) {
    if (!["string", "number", "boolean"].includes(typeof value.default))
      return null;
    result.default = value.default as JsonSchemaLike["default"];
  }
  return result;
}
