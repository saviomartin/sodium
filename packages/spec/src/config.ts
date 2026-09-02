import { z } from "zod";
import {
  DeploymentIdSchema,
  ProjectIdSchema,
  PublishableKeySchema,
  ToolIdSchema,
  ToolNameSchema,
  titleFromName,
} from "./ids";
import { AuthoredInputSchema, resolveInput, type AuthoredInput } from "./input";
import {
  ExtractFieldSchema,
  HTTP_METHODS,
  InteractionPostconditionSchema,
  InteractionStepSchema,
  type HandlerBinding,
  type RouteCondition,
} from "./handler";
import {
  ConfirmationPolicySchema,
  minimumConfirmationFor,
  RiskLevelSchema,
  type ConfirmationPolicy,
  type RiskLevel,
} from "./risk";
import { JsonSchemaSubsetSchema, type JsonSchemaSubset } from "./json-schema";

export const SODIUM_SCHEMA_VERSION = 1;

const RouteSchema = z.union([
  z.string().min(1).max(512).regex(/^\//),
  z
    .object({
      path: z.string().min(1).max(512).regex(/^\//),
      when: z.string().min(1).max(512).optional(),
    })
    .strict(),
]);

const FieldMapSchema = z.record(
  z.string().min(1).max(64),
  z.string().min(1).max(128),
);

const NavigateRunSchema = z
  .object({
    navigate: z
      .string()
      .min(1)
      .max(1024)
      .regex(/^\/(?!\/)/),
  })
  .strict();

const ExtractRunSchema = z
  .object({
    extract: z
      .object({ fields: z.array(ExtractFieldSchema).min(1).max(32) })
      .strict(),
  })
  .strict();

const FormRunSchema = z
  .object({
    form: z
      .object({
        selector: z.string().min(1).max(512),
        fields: FieldMapSchema.default({}),
        submit: z.string().min(1).max(512).optional(),
      })
      .strict(),
  })
  .strict();

const InteractionRunSchema = z
  .object({
    interaction: z
      .object({
        steps: z.array(InteractionStepSchema).min(1).max(8),
        expect: InteractionPostconditionSchema.optional(),
      })
      .strict(),
  })
  .strict();

const RequestRunSchema = z
  .object({
    request: z
      .object({
        method: z.enum(HTTP_METHODS),
        path: z
          .string()
          .min(1)
          .max(1024)
          .regex(/^\/(?!\/)/),
        query: FieldMapSchema.optional(),
        body: z
          .object({
            encoding: z.enum(["json", "form"]),
            fields: FieldMapSchema,
          })
          .strict()
          .optional(),
        response: z.enum(["json", "text", "status"]).default("json"),
      })
      .strict(),
  })
  .strict();

const CallRunSchema = z
  .object({
    call: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/),
  })
  .strict();

export const AuthoredRunSchema = z.union([
  NavigateRunSchema,
  ExtractRunSchema,
  FormRunSchema,
  InteractionRunSchema,
  RequestRunSchema,
  CallRunSchema,
]);
export type AuthoredRun = z.infer<typeof AuthoredRunSchema>;

const OutputSchema = z
  .object({
    description: z.string().min(1).max(1024),
    schema: JsonSchemaSubsetSchema.optional(),
  })
  .strict();

export const SodiumToolSchema = z
  .object({
    id: ToolIdSchema,
    name: ToolNameSchema,
    title: z.string().min(3).max(120).optional(),
    description: z.string().min(10).max(1024),
    input: AuthoredInputSchema.default({}),
    output: OutputSchema.optional(),
    on: z.array(RouteSchema).min(1).max(16).default(["/**"]),
    run: AuthoredRunSchema,
    risk: RiskLevelSchema,
    confirmation: ConfirmationPolicySchema.optional(),
  })
  .strict();
export type SodiumTool = z.infer<typeof SodiumToolSchema>;

export const SodiumConfigSchema = z
  .object({
    $schema: z.string().url().optional(),
    schemaVersion: z.literal(SODIUM_SCHEMA_VERSION),
    app: z
      .object({
        name: z.string().min(1).max(120),
        origins: z
          .array(
            z
              .string()
              .url()
              .refine((value) => new URL(value).origin === value, {
                message: "origin must not include a path, query, or fragment",
              }),
          )
          .min(1)
          .max(8),
      })
      .strict(),
    telemetry: z
      .object({ enabled: z.boolean().default(true) })
      .strict()
      .default({ enabled: true }),
    tools: z.array(SodiumToolSchema).min(1).max(128),
  })
  .strict();
export type SodiumConfig = z.infer<typeof SodiumConfigSchema>;

export const SodiumProjectSchema = z
  .object({
    schemaVersion: z.literal(SODIUM_SCHEMA_VERSION),
    projectId: ProjectIdSchema,
    publishableKey: PublishableKeySchema,
    endpoint: z.string().url(),
    deployment: z
      .object({
        id: DeploymentIdSchema,
        version: z.number().int().positive(),
        configHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .optional(),
  })
  .strict();
export type SodiumProject = z.infer<typeof SodiumProjectSchema>;

export interface CompiledTool {
  id: string;
  name: string;
  title: string;
  description: string;
  inputSchema: ReturnType<typeof resolveInput>;
  output?: { description: string; schema?: JsonSchemaSubset };
  routes: RouteCondition[];
  handler: HandlerBinding;
  riskLevel: RiskLevel;
  confirmation: ConfirmationPolicy;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: false;
  };
}

export interface CompiledSodiumConfig {
  schemaVersion: typeof SODIUM_SCHEMA_VERSION;
  app: { name: string; origins: string[] };
  telemetry: { enabled: boolean };
  tools: CompiledTool[];
}

export function routesFromAuthoring(tool: SodiumTool): RouteCondition[] {
  return tool.on.map((route) =>
    typeof route === "string"
      ? { pathPattern: route }
      : { pathPattern: route.path, requiresSelector: route.when },
  );
}

export function handlerFromRun(run: AuthoredRun): HandlerBinding {
  if ("navigate" in run) return { kind: "navigate", urlTemplate: run.navigate };
  if ("extract" in run) return { kind: "extract", fields: run.extract.fields };
  if ("form" in run) {
    return {
      kind: "form",
      formSelector: run.form.selector,
      fieldMap: run.form.fields,
      submitSelector: run.form.submit,
    };
  }
  if ("interaction" in run) {
    return {
      kind: "interaction",
      steps: run.interaction.steps,
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
      response: run.request.response,
    };
  }
  return { kind: "call", export: run.call };
}

function annotationsForRisk(risk: RiskLevel): CompiledTool["annotations"] {
  return {
    readOnlyHint: risk === "read_only",
    destructiveHint: risk === "destructive" || risk === "financial",
    idempotentHint: risk === "read_only" || risk === "reversible",
    openWorldHint: false,
  };
}

export function compileTool(tool: SodiumTool): CompiledTool {
  return {
    id: tool.id,
    name: tool.name,
    title: tool.title ?? titleFromName(tool.name),
    description: tool.description,
    inputSchema: resolveInput(tool.input as AuthoredInput),
    output: tool.output,
    routes: routesFromAuthoring(tool),
    handler: handlerFromRun(tool.run),
    riskLevel: tool.risk,
    confirmation: tool.confirmation ?? minimumConfirmationFor(tool.risk),
    annotations: annotationsForRisk(tool.risk),
  };
}

export function compileSodiumConfig(input: unknown): CompiledSodiumConfig {
  const config = SodiumConfigSchema.parse(input);
  return {
    schemaVersion: SODIUM_SCHEMA_VERSION,
    app: config.app,
    telemetry: config.telemetry,
    tools: config.tools.map(compileTool),
  };
}
