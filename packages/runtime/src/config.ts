import type {
  AuthoredInput,
  AuthoredRun,
  CompiledSodiumConfig,
  CompiledTool,
  HandlerBinding,
  JsonSchemaSubset,
  SodiumConfig,
  SodiumTool,
} from "sodium-webmcp-spec";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveInput(input: AuthoredInput | undefined) {
  const properties: Record<string, JsonSchemaSubset> = {};
  const required: string[] = [];
  for (const [name, field] of Object.entries(input ?? {})) {
    if (typeof field === "string") {
      properties[name] = { type: field };
      required.push(name);
    } else {
      const { optional, ...schema } = field as JsonSchemaSubset & {
        optional?: boolean;
      };
      properties[name] = schema;
      if (!optional && schema.default === undefined) required.push(name);
    }
  }
  return {
    type: "object" as const,
    properties,
    required,
    additionalProperties: false as const,
  };
}

function handlerFromRun(run: AuthoredRun): HandlerBinding {
  if ("navigate" in run) return { kind: "navigate", urlTemplate: run.navigate };
  if ("extract" in run) return { kind: "extract", fields: run.extract.fields };
  if ("form" in run) {
    return {
      kind: "form",
      formSelector: run.form.selector,
      fieldMap: run.form.fields ?? {},
      submitSelector: run.form.submit,
    };
  }
  if ("interaction" in run) {
    return {
      kind: "interaction",
      steps: run.interaction.steps.map((step) =>
        step.kind === "wait_for"
          ? { ...step, timeoutMs: step.timeoutMs ?? 3_000 }
          : step,
      ),
      postcondition: run.interaction.expect,
    };
  }
  if ("request" in run) {
    return {
      kind: "request",
      method: run.request.method,
      pathTemplate: run.request.path,
      queryMap: run.request.query,
      body: run.request.body
        ? {
            encoding: run.request.body.encoding,
            fieldMap: run.request.body.fields,
          }
        : undefined,
      response: run.request.response ?? "json",
    };
  }
  return { kind: "call", export: run.call };
}

function titleFromName(name: string): string {
  const words = name.split("_").filter(Boolean);
  if (words.length === 0) return name;
  const [first, ...rest] = words as [string, ...string[]];
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ");
}

function compileTool(tool: SodiumTool): CompiledTool {
  const risk = tool.risk;
  const minimum =
    risk === "destructive" || risk === "financial"
      ? "required"
      : risk === "state_changing"
        ? "recommended"
        : "none";
  const rank = { none: 0, recommended: 1, required: 2 } as const;
  const requested = tool.confirmation ?? minimum;
  const confirmation = rank[requested] >= rank[minimum] ? requested : minimum;
  return {
    id: tool.id,
    name: tool.name,
    title: tool.title ?? titleFromName(tool.name),
    description: tool.description,
    inputSchema: resolveInput(tool.input),
    output: tool.output,
    routes: tool.on.map((route) =>
      typeof route === "string"
        ? { pathPattern: route }
        : { pathPattern: route.path, requiresSelector: route.when },
    ),
    handler: handlerFromRun(tool.run),
    riskLevel: risk,
    confirmation,
    annotations: {
      readOnlyHint: risk === "read_only",
      destructiveHint: risk === "destructive" || risk === "financial",
      idempotentHint: risk === "read_only" || risk === "reversible",
      openWorldHint: false,
    },
  };
}

/**
 * The CLI strictly validates with Zod before deployment. The browser repeats
 * only structural checks, keeping the SDK small while ensuring malformed
 * application-owned JSON fails closed instead of breaking the host page.
 */
export function compileLocalConfig(
  input: unknown,
): CompiledSodiumConfig | null {
  if (!isRecord(input) || input.schemaVersion !== 1) return null;
  if (!isRecord(input.app) || typeof input.app.name !== "string") return null;
  if (
    !Array.isArray(input.app.origins) ||
    input.app.origins.length === 0 ||
    !input.app.origins.every((origin) => typeof origin === "string")
  )
    return null;
  if (
    !Array.isArray(input.tools) ||
    input.tools.length === 0 ||
    input.tools.length > 128
  )
    return null;
  for (const tool of input.tools) {
    const run = isRecord(tool) && isRecord(tool.run) ? tool.run : null;
    const runKeys = run
      ? [
          "navigate",
          "extract",
          "form",
          "interaction",
          "request",
          "call",
        ].filter((key) => key in run)
      : [];
    if (
      !isRecord(tool) ||
      typeof tool.id !== "string" ||
      typeof tool.name !== "string" ||
      typeof tool.description !== "string" ||
      !isRecord(tool.run) ||
      (tool.on !== undefined && !Array.isArray(tool.on)) ||
      ![
        "read_only",
        "reversible",
        "state_changing",
        "destructive",
        "financial",
      ].includes(String(tool.risk)) ||
      (tool.confirmation !== undefined &&
        !["none", "recommended", "required"].includes(
          String(tool.confirmation),
        )) ||
      runKeys.length !== 1
    )
      return null;
  }
  try {
    const config = input as unknown as SodiumConfig;
    const tools = (input.tools as SodiumTool[]).map((tool) => ({
      ...tool,
      input: tool.input ?? {},
      on: tool.on ?? ["/**"],
    }));
    return {
      schemaVersion: 1,
      app: config.app,
      telemetry: { enabled: config.telemetry?.enabled ?? true },
      tools: tools.map(compileTool),
    };
  } catch {
    return null;
  }
}
