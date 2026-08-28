import { z } from "zod";

/**
 * Public site identifier embedded in the loader snippet
 * (`<script src=".../agent.js" data-site="site_...">`). Not a secret; the
 * manifest endpoint only serves published, signed data.
 */
export const SITE_ID_PATTERN = /^site_[a-z0-9]{8,32}$/;
export const SiteIdSchema = z.string().regex(SITE_ID_PATTERN);
export type SiteId = z.infer<typeof SiteIdSchema>;

/**
 * WebMCP tool names: lowercase snake_case, must start with a letter.
 * Kept deliberately stricter than the proposal so names survive transport
 * changes (MCP, commerce adapters) without renaming.
 */
export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;
export const ToolNameSchema = z.string().regex(TOOL_NAME_PATTERN);

/** Stable action identifier: `act_` + 16 hex chars derived from source evidence. */
export const ACTION_ID_PATTERN = /^act_[a-f0-9]{16}$/;
export const ActionIdSchema = z.string().regex(ACTION_ID_PATTERN);

/** Names that would collide with loader-internal or agent-ambient behavior. */
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
]);
