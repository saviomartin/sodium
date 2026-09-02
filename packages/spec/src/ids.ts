import { z } from "zod";

/**
 * Project identifier. Public: it appears in the customer's bundle next to the
 * publishable key. Never a secret.
 */
export const PROJECT_ID_PATTERN = /^prj_[a-z0-9]{8,24}$/;
export const ProjectIdSchema = z.string().regex(PROJECT_ID_PATTERN);
export type ProjectId = z.infer<typeof ProjectIdSchema>;

/**
 * Stable tool identity, assigned once by the CLI and written back into
 * sodium.json. This is the analytics key, NOT the tool name: descriptions and
 * names get rewritten constantly (that is the whole point of the product) and
 * a rename must never reset a tool's history. Ids are never reused, even after
 * a tool is deleted.
 */
export const TOOL_ID_PATTERN = /^tl_[a-z0-9]{8}$/;
export const ToolIdSchema = z.string().regex(TOOL_ID_PATTERN);
export type ToolId = z.infer<typeof ToolIdSchema>;

/**
 * WebMCP tool names: lower_snake_case, starting with a letter. Deliberately
 * stricter than the proposal allows, so a name survives a transport change
 * (WebMCP in page, MCP over HTTP, extension bridge) without renaming.
 */
export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;
export const ToolNameSchema = z.string().regex(TOOL_NAME_PATTERN);

/** Publishable key: sent from the browser, origin-restricted, rate-limited. */
export const PUBLISHABLE_KEY_PATTERN = /^sod_pk_[a-z0-9]{24,40}$/;
export const PublishableKeySchema = z.string().regex(PUBLISHABLE_KEY_PATTERN);

export const DEPLOYMENT_ID_PATTERN = /^dep_[a-z0-9]{12,24}$/;
export const DeploymentIdSchema = z.string().regex(DEPLOYMENT_ID_PATTERN);

/** Deploy key: used by `sodium deploy` from CI. Secret. */
export const DEPLOY_KEY_PATTERN = /^sod_sk_[a-z0-9]{24,40}$/;
export const DeployKeySchema = z.string().regex(DEPLOY_KEY_PATTERN);

/** Names that collide with SDK internals or ambient agent behavior. */
export const RESERVED_TOOL_NAMES = new Set([
  "eval",
  "exec",
  "constructor",
  "prototype",
  "__proto__",
  "tool",
  "tools",
  "register",
  "unregister",
  "sodium",
]);

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Random id suffix from the shared alphabet. Uses WebCrypto so the same code
 * runs in the CLI and in the browser without a polyfill.
 */
function randomSuffix(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += ID_ALPHABET[byte % ID_ALPHABET.length];
  return out;
}

export function newToolId(): ToolId {
  return `tl_${randomSuffix(8)}`;
}

export function newProjectId(): ProjectId {
  return `prj_${randomSuffix(12)}`;
}

export function newPublishableKey(): string {
  return `sod_pk_${randomSuffix(32)}`;
}

export function newDeploymentId(): string {
  return `dep_${randomSuffix(16)}`;
}

/** `search_products` -> `Search products`. Used when `title` is omitted. */
export function titleFromName(name: string): string {
  const words = name.split("_").filter(Boolean);
  if (words.length === 0) return name;
  const [first, ...rest] = words as [string, ...string[]];
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ");
}
