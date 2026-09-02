import { z } from "zod";

/**
 * Handler bindings describe HOW the SDK executes a tool call. Everything here
 * is the DESUGARED form: `run.ts` turns the friendly `run` block in sodium.json
 * into one of these, and the SDK only ever sees these.
 *
 * Five of the six kinds are pure data, so a tool can be described without
 * writing any code. The sixth (`call`) hands control to a function the customer
 * exported themselves, for the cases data cannot express.
 */

const SelectorSchema = z.string().min(1).max(512);

/** Input property -> target name (query param, form control, body field). */
const FieldMapSchema = z.record(
  z.string().min(1).max(64),
  z.string().min(1).max(128),
);

export const NavigateHandlerSchema = z
  .object({
    kind: z.literal("navigate"),
    /** Path template with `{param}` placeholders resolved from tool input. */
    urlTemplate: z
      .string()
      .max(1024)
      .regex(/^\//, "urlTemplate must be a same-origin path"),
  })
  .strict();

export const ExtractFieldSchema = z
  .object({
    name: z.string().max(64),
    selector: z.string().max(512),
    /** Attribute to read; defaults to trimmed text content. */
    attribute: z.string().max(64).optional(),
    /** Collect every match instead of the first. */
    all: z.boolean().optional(),
  })
  .strict();

export const ExtractHandlerSchema = z
  .object({
    kind: z.literal("extract"),
    fields: z.array(ExtractFieldSchema).min(1).max(32),
  })
  .strict();

export const FormHandlerSchema = z
  .object({
    kind: z.literal("form"),
    formSelector: z.string().max(512),
    fieldMap: FieldMapSchema,
    submitSelector: z.string().max(512).optional(),
  })
  .strict();

export const InteractionStepSchema = z.union([
  z
    .object({
      kind: z.literal("set"),
      selector: SelectorSchema,
      input: z.string().min(1).max(64),
    })
    .strict(),
  z.object({ kind: z.literal("click"), selector: SelectorSchema }).strict(),
  z
    .object({
      kind: z.literal("click"),
      role: z.literal("button"),
      name: z.string().min(1).max(160),
    })
    .strict(),
  z
    .object({
      kind: z.literal("submit"),
      formSelector: SelectorSchema,
      submitSelector: SelectorSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("wait_for"),
      selector: SelectorSchema,
      state: z.enum(["present", "absent"]),
      timeoutMs: z.number().int().min(50).max(10_000).default(3_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("read"),
      selector: SelectorSchema,
      output: z.string().min(1).max(64),
      attribute: z
        .string()
        .min(1)
        .max(64)
        .regex(/^(?!on)/i)
        .optional(),
    })
    .strict(),
]);

export const InteractionPostconditionSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("selector_present"), selector: SelectorSchema })
    .strict(),
  z
    .object({ kind: z.literal("selector_absent"), selector: SelectorSchema })
    .strict(),
  z
    .object({
      kind: z.literal("path_matches"),
      pathPattern: z.string().min(1).max(512).regex(/^\//),
    })
    .strict(),
]);

export const InteractionHandlerSchema = z
  .object({
    kind: z.literal("interaction"),
    steps: z.array(InteractionStepSchema).min(1).max(8),
    postcondition: InteractionPostconditionSchema.optional(),
  })
  .strict();

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export const HttpMethodSchema = z.enum(HTTP_METHODS);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const RequestHandlerSchema = z
  .object({
    kind: z.literal("request"),
    method: HttpMethodSchema,
    pathTemplate: z
      .string()
      .min(1)
      .max(1024)
      .regex(/^\/(?!\/)/, "pathTemplate must be a same-origin path"),
    queryMap: FieldMapSchema.optional(),
    body: z
      .object({
        encoding: z.enum(["json", "form"]),
        fieldMap: FieldMapSchema,
      })
      .strict()
      .optional(),
    response: z.enum(["json", "text", "status"]),
  })
  .strict()
  .superRefine((handler, ctx) => {
    if (
      (handler.method === "GET" || handler.method === "DELETE") &&
      handler.body
    ) {
      ctx.addIssue({
        code: "custom",
        message: `${handler.method} handlers cannot include a body`,
      });
    }
  });

/**
 * The escape hatch. Names an export from the handlers module the customer
 * passes to the SDK, so the function is resolved by their bundler at build
 * time. sodium.json never carries a path, a specifier, or code: there is
 * nothing here for the SDK to import, evaluate, or fetch.
 */
export const CallHandlerSchema = z
  .object({
    kind: z.literal("call"),
    export: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/, "export must be a JS identifier"),
  })
  .strict();

export const HandlerBindingSchema = z.discriminatedUnion("kind", [
  NavigateHandlerSchema,
  ExtractHandlerSchema,
  FormHandlerSchema,
  InteractionHandlerSchema,
  RequestHandlerSchema,
  CallHandlerSchema,
]);
export type HandlerBinding = z.infer<typeof HandlerBindingSchema>;
export type HandlerKind = HandlerBinding["kind"];

/** Where and when a tool should be registered on the customer's site. */
export const RouteConditionSchema = z
  .object({
    /** Path pattern: literal segments plus `*` (one segment) and `**` (rest). */
    pathPattern: z
      .string()
      .max(512)
      .regex(/^\//, "pathPattern must start with /"),
    /** Only register when this selector exists (e.g. an authenticated shell). */
    requiresSelector: z.string().max(512).optional(),
  })
  .strict();
export type RouteCondition = z.infer<typeof RouteConditionSchema>;

/** Stable key for "two tools do the same thing". Used by overlap warnings. */
export function handlerTargetKey(handler: HandlerBinding): string | null {
  switch (handler.kind) {
    case "navigate":
      return `navigate:${handler.urlTemplate}`;
    case "form":
      return `form:${handler.formSelector}`;
    case "interaction":
      return `interaction:${JSON.stringify(handler.steps)}`;
    case "request":
      return `request:${handler.method}:${handler.pathTemplate}`;
    case "call":
      return `call:${handler.export}`;
    case "extract":
      return null;
  }
}
