import {
  validateValue,
  type ActionContract,
  type JsonSchemaSubset,
} from "@sodium/contracts";

/**
 * Deterministic pre-review evaluations. These run after schema validation and
 * before a candidate is marked ready for review. No model calls — results are
 * reproducible and cheap.
 */

export interface EvalResult {
  name: string;
  passed: boolean;
  details: string;
}

export function runCandidateEvals(
  contract: ActionContract,
  siblings: ActionContract[],
): EvalResult[] {
  return [
    schemaRoundTripEval(contract),
    outputContractEval(contract),
    evidenceTraceabilityEval(contract),
    descriptionBudgetEval(contract),
    agentSelectionEval(contract, siblings),
  ];
}

/** Checks the declared output against the exact successful runtime envelope. */
export function outputContractEval(contract: ActionContract): EvalResult {
  if (!contract.output.schema) {
    return {
      name: "output_contract",
      passed: false,
      details: "no machine-checkable output schema is attached",
    };
  }
  const result = successfulRuntimeResult(contract);
  const issues = validateValue(contract.output.schema, result);
  return issues.length === 0
    ? {
        name: "output_contract",
        passed: true,
        details:
          "declared schema accepts the handler's successful runtime result",
      }
    : {
        name: "output_contract",
        passed: false,
        details: `successful runtime result rejected: ${issues[0]!.message} at ${issues[0]!.path}`,
      };
}

/** Ensures the executable and authorization claims cite matching source facts. */
export function evidenceTraceabilityEval(contract: ActionContract): EvalResult {
  const sourceKinds = new Set(
    contract.evidence
      .filter((evidence) => evidence.kind === "source")
      .map((evidence) => evidence.primitive),
  );
  const acceptable =
    contract.handler.kind === "navigate"
      ? ["route"]
      : contract.handler.kind === "form"
        ? ["form"]
        : contract.handler.kind === "interaction"
          ? ["ui_event"]
          : contract.handler.kind === "request"
            ? ["route_handler"]
            : ["route", "form", "ui_event"];
  if (!acceptable.some((kind) => sourceKinds.has(kind as never))) {
    return {
      name: "evidence_traceability",
      passed: false,
      details: `${contract.handler.kind} handler lacks matching ${acceptable.join("/")} source evidence`,
    };
  }
  if (contract.auth.required && !sourceKinds.has("auth_check")) {
    return {
      name: "evidence_traceability",
      passed: false,
      details:
        "authorization is required but no auth_check evidence is attached",
    };
  }
  return {
    name: "evidence_traceability",
    passed: true,
    details:
      "handler and authorization claims trace to matching source evidence",
  };
}

function successfulRuntimeResult(contract: ActionContract): unknown {
  switch (contract.handler.kind) {
    case "navigate":
      return {
        ok: true,
        navigatedTo: contract.handler.urlTemplate,
        note: "navigation started; tools re-register on the new page",
      };
    case "form":
      return { ok: true, submitted: true };
    case "interaction":
    case "extract":
      return { ok: true, data: {} };
    case "request":
      return {
        ok: true,
        status: 200,
        ...(contract.handler.response === "status"
          ? {}
          : {
              data: contract.handler.response === "text" ? "example" : {},
            }),
      };
  }
}

/**
 * Generates a conforming example from the input schema and checks it
 * validates; then corrupts it and checks validation fails. Guards against
 * schemas that accept nothing or everything.
 */
export function schemaRoundTripEval(contract: ActionContract): EvalResult {
  const schema = contract.inputSchema;
  const example = exampleFromSchema(schema);
  const validIssues = validateValue(schema, example);
  if (validIssues.length > 0) {
    return {
      name: "schema_round_trip",
      passed: false,
      details: `generated example rejected: ${validIssues[0]!.message} at ${validIssues[0]!.path}`,
    };
  }
  const required = schema.required ?? [];
  if (required.length > 0) {
    const corrupted = { ...(example as Record<string, unknown>) };
    delete corrupted[required[0]!];
    if (validateValue(schema, corrupted).length === 0) {
      return {
        name: "schema_round_trip",
        passed: false,
        details: `schema accepted input missing required "${required[0]}"`,
      };
    }
  } else if (schema.additionalProperties === false) {
    const corrupted = {
      ...(example as Record<string, unknown>),
      __unexpected: 1,
    };
    if (validateValue(schema, corrupted).length === 0) {
      return {
        name: "schema_round_trip",
        passed: false,
        details: "schema accepted unexpected properties",
      };
    }
  }
  return {
    name: "schema_round_trip",
    passed: true,
    details: "example accepted; corrupted input rejected",
  };
}

/** Chrome WebMCP guidance budgets: ~500 chars/description, 150/parameter. */
export function descriptionBudgetEval(contract: ActionContract): EvalResult {
  if (contract.description.length > 500) {
    return {
      name: "description_budget",
      passed: false,
      details: `description is ${contract.description.length} chars (budget 500)`,
    };
  }
  for (const [name, prop] of Object.entries(
    contract.inputSchema.properties ?? {},
  )) {
    if ((prop.description ?? "").length > 150) {
      return {
        name: "description_budget",
        passed: false,
        details: `parameter "${name}" description exceeds 150 chars`,
      };
    }
  }
  return {
    name: "description_budget",
    passed: true,
    details: "within agent-facing text budgets",
  };
}

/**
 * Agent-selection check: this tool's own title/description tokens must match
 * itself more strongly than any sibling; ambiguous sets confuse tool-picking
 * agents and get flagged for human wording review.
 */
export function agentSelectionEval(
  contract: ActionContract,
  siblings: ActionContract[],
): EvalResult {
  const query = tokenize(`${contract.title} ${contract.description}`);
  const selfScore = overlap(
    query,
    tokenize(`${contract.title} ${contract.description}`),
  );
  for (const sibling of siblings) {
    if (sibling.actionId === contract.actionId) continue;
    const siblingScore = overlap(
      query,
      tokenize(`${sibling.title} ${sibling.description}`),
    );
    if (siblingScore >= selfScore) {
      return {
        name: "agent_selection",
        passed: false,
        details: `wording is ambiguous with "${sibling.name}" — an agent may pick the wrong tool`,
      };
    }
  }
  return {
    name: "agent_selection",
    passed: true,
    details: "tool is distinguishable from its siblings",
  };
}

export function exampleFromSchema(schema: JsonSchemaSubset): unknown {
  if (schema.const !== undefined) return schema.const;
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];
  switch (schema.type) {
    case "object": {
      const result: Record<string, unknown> = {};
      for (const [name, prop] of Object.entries(schema.properties ?? {})) {
        if ((schema.required ?? []).includes(name))
          result[name] = exampleFromSchema(prop);
      }
      return result;
    }
    case "array":
      return schema.items ? [exampleFromSchema(schema.items)] : [];
    case "string": {
      if (schema.format === "email") return "user@example.com";
      if (schema.format === "uuid")
        return "00000000-0000-0000-0000-000000000000";
      if (schema.format === "uri") return "https://example.com/";
      const min = schema.minLength ?? 1;
      let value = "example value for evaluation";
      while (value.length < min) value += " padding";
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        value = value.slice(
          0,
          Math.max(schema.minLength ?? 1, schema.maxLength),
        );
      }
      if (schema.pattern) {
        // Patterned strings can't be synthesized generically; common cases:
        if (/@/.test(schema.pattern)) return "user@example.com";
        return value;
      }
      return value;
    }
    case "integer":
    case "number": {
      const min = schema.minimum ?? 1;
      const max = schema.maximum ?? min + 1;
      const value = Math.min(Math.max(1, min), max);
      return schema.type === "integer" ? Math.round(value) : value;
    }
    case "boolean":
      return true;
    default:
      return "value";
  }
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) if (b.has(token)) count++;
  return count;
}
