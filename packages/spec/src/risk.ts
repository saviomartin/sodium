import { z } from "zod";

/**
 * Risk classification for an action, ordered from least to most consequential.
 * The ordering is load-bearing: publication gates and confirmation floors are
 * expressed as "at least rank N".
 */
export const RISK_LEVELS = [
  "read_only",
  "reversible",
  "state_changing",
  "destructive",
  "financial",
] as const;

export const RiskLevelSchema = z.enum(RISK_LEVELS);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

const RISK_RANK: Record<RiskLevel, number> = {
  read_only: 0,
  reversible: 1,
  state_changing: 2,
  destructive: 3,
  financial: 4,
};

export function riskRank(level: RiskLevel): number {
  return RISK_RANK[level];
}

export function riskAtLeast(level: RiskLevel, floor: RiskLevel): boolean {
  return riskRank(level) >= riskRank(floor);
}

/** Whether a risk level mutates state at all. */
export function isStateChanging(level: RiskLevel): boolean {
  return riskRank(level) >= RISK_RANK.reversible;
}

export const CONFIRMATION_POLICIES = [
  "none",
  "recommended",
  "required",
] as const;
export const ConfirmationPolicySchema = z.enum(CONFIRMATION_POLICIES);
export type ConfirmationPolicy = z.infer<typeof ConfirmationPolicySchema>;

const CONFIRMATION_RANK: Record<ConfirmationPolicy, number> = {
  none: 0,
  recommended: 1,
  required: 2,
};

export function confirmationRank(policy: ConfirmationPolicy): number {
  return CONFIRMATION_RANK[policy];
}

/**
 * The minimum confirmation policy a contract must declare for its risk level.
 * Deterministic validation rejects contracts below this floor, regardless of
 * what the AI proposed.
 */
export function minimumConfirmationFor(level: RiskLevel): ConfirmationPolicy {
  switch (level) {
    case "read_only":
    case "reversible":
      return "none";
    case "state_changing":
      return "recommended";
    case "destructive":
    case "financial":
      return "required";
  }
}

export const RISK_LABELS: Record<RiskLevel, string> = {
  read_only: "Read-only",
  reversible: "Reversible",
  state_changing: "State-changing",
  destructive: "Destructive",
  financial: "Financial",
};
