import { z } from "zod";

/**
 * Compatibility findings produced by continuous sync: the delta between a
 * published contract and what the current default-branch code supports.
 * Findings never mutate the production manifest; they gate a DRAFT version
 * that a human must approve.
 */
export const COMPAT_FINDING_KINDS = [
  "input_changed",
  "handler_removed",
  "side_effect_changed",
  "auth_changed",
  "eval_broken",
  "evidence_drifted",
] as const;
export const CompatFindingKindSchema = z.enum(COMPAT_FINDING_KINDS);
export type CompatFindingKind = z.infer<typeof CompatFindingKindSchema>;

export const COMPAT_SEVERITIES = ["info", "warning", "breaking"] as const;
export const CompatSeveritySchema = z.enum(COMPAT_SEVERITIES);
export type CompatSeverity = z.infer<typeof CompatSeveritySchema>;

export const CompatFindingSchema = z
  .object({
    kind: CompatFindingKindSchema,
    severity: CompatSeveritySchema,
    toolName: z.string().max(64),
    summary: z.string().max(500),
    detail: z.string().max(2000).optional(),
    /** File that changed, when the finding is source-derived. */
    filePath: z.string().max(512).optional(),
  })
  .strict();
export type CompatFinding = z.infer<typeof CompatFindingSchema>;
