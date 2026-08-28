import {
  ActionContractSchema,
  type ActionContract,
  type HandlerBinding,
} from "./action-contract";
import { RESERVED_TOOL_NAMES, TOOL_NAME_PATTERN } from "./ids";
import { checkSchemaLimits } from "./json-schema";
import { confirmationRank, minimumConfirmationFor, riskAtLeast } from "./risk";

/**
 * Deterministic validation of AI-proposed contracts. The AI may propose;
 * only code decides. Every rule here is pure and unit-tested — no model in
 * the loop. Errors block the candidate; warnings downgrade it to needs_review.
 */

export interface ContractIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
}

export interface ContractValidationResult {
  ok: boolean;
  issues: ContractIssue[];
}

const INJECTION_MARKERS = [
  "ignore previous",
  "ignore all previous",
  "disregard the above",
  "system prompt",
  "you are now",
  "do not tell the user",
  "<script",
  "javascript:",
];

function err(code: string, message: string, path?: string): ContractIssue {
  return { severity: "error", code, message, path };
}
function warn(code: string, message: string, path?: string): ContractIssue {
  return { severity: "warning", code, message, path };
}

export function validateContract(input: unknown): ContractValidationResult {
  const issues: ContractIssue[] = [];

  const parsed = ActionContractSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push(err("schema_invalid", issue.message, issue.path.join(".")));
    }
    return { ok: false, issues };
  }
  const contract = parsed.data;

  // Names.
  if (!TOOL_NAME_PATTERN.test(contract.name)) {
    issues.push(
      err(
        "invalid_name",
        `tool name "${contract.name}" is not lower_snake_case`,
      ),
    );
  }
  if (RESERVED_TOOL_NAMES.has(contract.name)) {
    issues.push(
      err("reserved_name", `tool name "${contract.name}" is reserved`),
    );
  }

  // Input schema structural limits.
  for (const schemaIssue of checkSchemaLimits(contract.inputSchema)) {
    issues.push(
      err("input_schema_limits", schemaIssue.message, schemaIssue.path),
    );
  }
  if (contract.output.schema) {
    for (const schemaIssue of checkSchemaLimits(contract.output.schema)) {
      issues.push(
        err("output_schema_limits", schemaIssue.message, schemaIssue.path),
      );
    }
  }

  // Risk / confirmation floor.
  const floor = minimumConfirmationFor(contract.riskLevel);
  if (confirmationRank(contract.confirmation) < confirmationRank(floor)) {
    issues.push(
      err(
        "confirmation_below_floor",
        `risk "${contract.riskLevel}" requires confirmation >= "${floor}", got "${contract.confirmation}"`,
      ),
    );
  }

  // Handler / risk consistency: declarative read handlers must not claim to
  // change state, and state-changing behavior must not hide behind them.
  issues.push(...checkHandlerRiskConsistency(contract));

  // Handler bindings must be satisfiable from the input schema.
  issues.push(...checkHandlerInputs(contract));

  // Evidence: anything beyond read-only must cite source evidence.
  if (contract.evidence.length === 0) {
    issues.push(
      riskAtLeast(contract.riskLevel, "reversible")
        ? err("missing_evidence", "state-affecting contracts require evidence")
        : warn("missing_evidence", "no evidence attached"),
    );
  }

  // Prompt-injection screening on human/agent-facing strings sourced from
  // untrusted repository or page content.
  for (const [field, text] of [
    ["title", contract.title],
    ["description", contract.description],
  ] as const) {
    const lowered = text.toLowerCase();
    for (const marker of INJECTION_MARKERS) {
      if (lowered.includes(marker)) {
        issues.push(
          err(
            "suspicious_text",
            `${field} contains suspicious content ("${marker}")`,
            field,
          ),
        );
      }
    }
  }

  // Confidence sanity.
  if (contract.confidence > 0.9 && contract.evidence.length < 2) {
    issues.push(
      warn(
        "overconfident",
        "confidence > 0.9 with fewer than 2 pieces of evidence",
      ),
    );
  }

  return { ok: !issues.some((i) => i.severity === "error"), issues };
}

function checkHandlerRiskConsistency(
  contract: ActionContract,
): ContractIssue[] {
  const issues: ContractIssue[] = [];
  const { handler, riskLevel } = contract;
  switch (handler.kind) {
    case "navigate":
    case "extract":
      if (riskLevel !== "read_only") {
        issues.push(
          err(
            "handler_risk_mismatch",
            `${handler.kind} handlers are read-only; contract claims "${riskLevel}"`,
          ),
        );
      }
      break;
    case "form":
      if (riskLevel === "read_only") {
        issues.push(
          err(
            "handler_risk_mismatch",
            "form submission cannot be classified read_only",
          ),
        );
      }
      if (riskAtLeast(riskLevel, "destructive")) {
        issues.push(
          err(
            "unsafe_effect",
            "destructive/financial actions must use a bridge handler with backend confirmation, not automatic form submission",
          ),
        );
      }
      break;
    case "bridge":
      break;
  }
  return issues;
}

function checkHandlerInputs(contract: ActionContract): ContractIssue[] {
  const issues: ContractIssue[] = [];
  const props = new Set(Object.keys(contract.inputSchema.properties ?? {}));
  const required = new Set(contract.inputSchema.required ?? []);
  const handler: HandlerBinding = contract.handler;

  if (handler.kind === "navigate") {
    const params = [
      ...handler.urlTemplate.matchAll(/\{([a-zA-Z0-9_]+)\}/g),
    ].map((m) => m[1]!);
    for (const param of params) {
      if (!props.has(param)) {
        issues.push(
          err(
            "unbound_template_param",
            `urlTemplate references unknown input "${param}"`,
          ),
        );
      } else if (!required.has(param)) {
        issues.push(
          err(
            "optional_template_param",
            `urlTemplate input "${param}" must be required`,
          ),
        );
      }
    }
  }
  if (handler.kind === "form") {
    for (const key of Object.keys(handler.fieldMap)) {
      if (!props.has(key)) {
        issues.push(
          err(
            "unbound_form_field",
            `fieldMap references unknown input "${key}"`,
          ),
        );
      }
    }
  }
  return issues;
}

/**
 * Cross-contract validation: duplicate names and overlapping purposes.
 * Overlap is deterministic — same handler target or near-identical wording —
 * and only warns; humans arbitrate in review.
 */
export function validateContractSet(
  contracts: ActionContract[],
): Map<string, ContractIssue[]> {
  const byActionId = new Map<string, ContractIssue[]>();
  const push = (actionId: string, issue: ContractIssue) => {
    const list = byActionId.get(actionId) ?? [];
    list.push(issue);
    byActionId.set(actionId, list);
  };

  const nameOwners = new Map<string, string>();
  for (const contract of contracts) {
    const owner = nameOwners.get(contract.name);
    if (owner) {
      push(
        contract.actionId,
        err(
          "duplicate_name",
          `tool name "${contract.name}" already used by ${owner}`,
        ),
      );
    } else {
      nameOwners.set(contract.name, contract.actionId);
    }
  }

  const handlerTargets = new Map<string, string>();
  for (const contract of contracts) {
    const target = handlerTargetKey(contract.handler);
    if (!target) continue;
    const owner = handlerTargets.get(target);
    if (owner && owner !== contract.actionId) {
      push(
        contract.actionId,
        warn(
          "overlapping_purpose",
          `same handler target as ${owner} (${target})`,
        ),
      );
    } else {
      handlerTargets.set(target, contract.actionId);
    }
  }

  for (let i = 0; i < contracts.length; i++) {
    for (let j = i + 1; j < contracts.length; j++) {
      const a = contracts[i]!;
      const b = contracts[j]!;
      if (titleSimilarity(a.title, b.title) >= 0.9) {
        push(
          b.actionId,
          warn(
            "overlapping_purpose",
            `title nearly identical to ${a.actionId} ("${a.title}")`,
          ),
        );
      }
    }
  }

  return byActionId;
}

function handlerTargetKey(handler: HandlerBinding): string | null {
  switch (handler.kind) {
    case "navigate":
      return `navigate:${handler.urlTemplate}`;
    case "form":
      return `form:${handler.formSelector}`;
    case "bridge":
      return `bridge:${handler.bridgeKey}`;
    case "extract":
      return null;
  }
}

/** Dice coefficient over word bigrams; deterministic and dependency-free. */
export function titleSimilarity(a: string, b: string): number {
  const bigrams = (s: string): Map<string, number> => {
    const words = s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .split(/\s+/)
      .filter(Boolean);
    const map = new Map<string, number>();
    for (let i = 0; i < words.length - 1; i++) {
      const key = `${words[i]} ${words[i + 1]}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    if (words.length === 1) map.set(words[0]!, 1);
    return map;
  };
  const aGrams = bigrams(a);
  const bGrams = bigrams(b);
  if (aGrams.size === 0 || bGrams.size === 0)
    return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
  let overlap = 0;
  for (const [gram, count] of aGrams) {
    overlap += Math.min(count, bGrams.get(gram) ?? 0);
  }
  const total =
    [...aGrams.values()].reduce((s, n) => s + n, 0) +
    [...bGrams.values()].reduce((s, n) => s + n, 0);
  return (2 * overlap) / total;
}
