import { SodiumConfigSchema, compileTool, type SodiumConfig } from "./config";
import { handlerTargetKey, type HandlerBinding } from "./handler";
import { RESERVED_TOOL_NAMES } from "./ids";
import { checkSchemaLimits } from "./json-schema";
import { confirmationRank, minimumConfirmationFor } from "./risk";

export interface ConfigIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
}

export interface ConfigValidationResult {
  ok: boolean;
  config?: SodiumConfig;
  issues: ConfigIssue[];
}

const error = (code: string, message: string, path?: string): ConfigIssue => ({
  severity: "error",
  code,
  message,
  path,
});

const warning = (
  code: string,
  message: string,
  path?: string,
): ConfigIssue => ({
  severity: "warning",
  code,
  message,
  path,
});

export function validateSodiumConfig(input: unknown): ConfigValidationResult {
  const parsed = SodiumConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) =>
        error("schema_invalid", issue.message, issue.path.join(".")),
      ),
    };
  }

  const issues: ConfigIssue[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  const targets = new Map<string, string>();

  parsed.data.tools.forEach((tool, index) => {
    const path = `tools.${index}`;
    if (ids.has(tool.id))
      issues.push(
        error("duplicate_id", `duplicate tool id ${tool.id}`, `${path}.id`),
      );
    if (names.has(tool.name))
      issues.push(
        error(
          "duplicate_name",
          `duplicate tool name ${tool.name}`,
          `${path}.name`,
        ),
      );
    if (RESERVED_TOOL_NAMES.has(tool.name))
      issues.push(
        error("reserved_name", `${tool.name} is reserved`, `${path}.name`),
      );
    ids.add(tool.id);
    names.add(tool.name);

    const compiled = compileTool(tool);
    for (const schemaIssue of checkSchemaLimits(compiled.inputSchema)) {
      issues.push(
        error(
          "input_schema_limits",
          schemaIssue.message,
          `${path}.input${schemaIssue.path.slice(1)}`,
        ),
      );
    }

    const minimum = minimumConfirmationFor(tool.risk);
    if (confirmationRank(compiled.confirmation) < confirmationRank(minimum)) {
      issues.push(
        error(
          "confirmation_below_floor",
          `${tool.risk} tools require ${minimum} confirmation`,
          `${path}.confirmation`,
        ),
      );
    }

    issues.push(
      ...validateHandler(
        compiled.handler,
        tool.risk,
        Object.keys(tool.input),
        path,
      ),
    );

    const target = handlerTargetKey(compiled.handler);
    const owner = target ? targets.get(target) : undefined;
    if (target && owner) {
      issues.push(
        warning(
          "overlapping_target",
          `same execution target as ${owner}`,
          `${path}.run`,
        ),
      );
    } else if (target) {
      targets.set(target, tool.id);
    }
  });

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    config: parsed.data,
    issues,
  };
}

function validateHandler(
  handler: HandlerBinding,
  risk: SodiumConfig["tools"][number]["risk"],
  fields: string[],
  path: string,
): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const declared = new Set(fields);
  const used = new Set<string>();
  const use = (name: string, source: string) => {
    used.add(name);
    if (!declared.has(name)) {
      issues.push(
        error(
          "unknown_input",
          `${source} references unknown input ${name}`,
          `${path}.run`,
        ),
      );
    }
  };

  if (
    (handler.kind === "navigate" || handler.kind === "extract") &&
    risk !== "read_only"
  ) {
    issues.push(
      error(
        "risk_mismatch",
        `${handler.kind} must be read_only`,
        `${path}.risk`,
      ),
    );
  }
  if (handler.kind === "request") {
    if (handler.method === "GET" && risk !== "read_only")
      issues.push(
        error(
          "risk_mismatch",
          "GET requests must be read_only",
          `${path}.risk`,
        ),
      );
    if (handler.method !== "GET" && risk === "read_only")
      issues.push(
        error(
          "risk_mismatch",
          `${handler.method} requests change state`,
          `${path}.risk`,
        ),
      );
  }
  if (
    (handler.kind === "form" || handler.kind === "interaction") &&
    risk === "read_only"
  ) {
    issues.push(
      error(
        "risk_mismatch",
        `${handler.kind} cannot be read_only`,
        `${path}.risk`,
      ),
    );
  }

  if (handler.kind === "navigate") {
    for (const match of handler.urlTemplate.matchAll(/\{([a-zA-Z0-9_]+)\}/g))
      use(match[1]!, "navigate path");
  } else if (handler.kind === "form") {
    Object.keys(handler.fieldMap).forEach((name) => use(name, "form fields"));
  } else if (handler.kind === "interaction") {
    handler.steps.forEach((step) => {
      if (step.kind === "set") use(step.input, "interaction step");
    });
  } else if (handler.kind === "request") {
    for (const match of handler.pathTemplate.matchAll(/\{([a-zA-Z0-9_]+)\}/g))
      use(match[1]!, "request path");
    Object.keys(handler.queryMap ?? {}).forEach((name) =>
      use(name, "request query"),
    );
    Object.keys(handler.body?.fieldMap ?? {}).forEach((name) =>
      use(name, "request body"),
    );
  } else if (handler.kind === "call") {
    fields.forEach((name) => used.add(name));
  }

  fields.forEach((name) => {
    if (!used.has(name))
      issues.push(
        error(
          "unused_input",
          `input ${name} is never consumed`,
          `${path}.input.${name}`,
        ),
      );
  });
  return issues;
}
