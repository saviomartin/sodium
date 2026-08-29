import { describe, expect, it, vi } from "vitest";
import type { StaticAnalysis } from "@sodium/analyzer";
import {
  DEFAULT_AI_FALLBACK_MODEL,
  DEFAULT_AI_MODEL,
  loadEnv,
  type WorkerEnv,
} from "../src/env";
import { buildPrimitives } from "../src/pipeline/primitives";
import {
  AiSdkProvider,
  FallbackAiProvider,
  HeuristicAiProvider,
  type ProposedTool,
} from "../src/providers/ai-provider";

const analysis: StaticAnalysis = {
  framework: "nextjs",
  appDir: "app",
  routes: [
    {
      urlPattern: "/products/[id]",
      pathPattern: "/products/*",
      kind: "page",
      params: ["id"],
      span: {
        filePath: "app/products/[id]/page.tsx",
        startLine: 1,
        endLine: 20,
      },
    },
    {
      urlPattern: "/contact",
      pathPattern: "/contact",
      kind: "page",
      params: [],
      span: {
        filePath: "app/contact/page.tsx",
        startLine: 1,
        endLine: 30,
      },
    },
  ],
  serverActions: [
    {
      name: "submitContact",
      params: ["formData"],
      parameters: [{ name: "formData", typeText: "FormData" }],
      takesFormData: true,
      authSignals: [],
      excerpt: "export async function submitContact(formData: FormData) {}",
      span: { filePath: "app/actions.ts", startLine: 1, endLine: 4 },
    },
    {
      name: "addToCart",
      params: ["productId"],
      parameters: [{ name: "productId", typeText: "string" }],
      takesFormData: false,
      authSignals: [],
      excerpt: "export async function addToCart(productId: string) {}",
      span: { filePath: "app/actions.ts", startLine: 6, endLine: 9 },
    },
  ],
  routeHandlers: [],
  forms: [
    {
      urlPattern: "/contact",
      pathPattern: "/contact",
      selector: "#contact-form",
      fields: [
        { name: "email", type: "email", required: true },
        { name: "message", type: "textarea", required: true },
      ],
      action: { kind: "server_action", name: "submitContact" },
      excerpt: '<form id="contact-form" action={submitContact}>...</form>',
      span: {
        filePath: "app/contact/page.tsx",
        startLine: 10,
        endLine: 30,
      },
    },
    {
      urlPattern: "/settings",
      pathPattern: "/settings",
      fields: [{ name: "name", type: "text", required: true }],
      action: { kind: "unknown" },
      excerpt: "<form>...</form><form>...</form>",
      span: {
        filePath: "app/settings/page.tsx",
        startLine: 10,
        endLine: 20,
      },
    },
  ],
  links: [],
  zodSchemas: [],
  authSignals: [],
  warnings: [],
  stats: { filesScanned: 4, filesSkipped: 0, bytesRead: 1000 },
};

const primitives = buildPrimitives(analysis);

const navigation: ProposedTool = {
  name: "open_product",
  title: "Open product",
  description: "Opens the page for a specific product in the current shop.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  outputDescription: "Navigation acknowledgement.",
  riskLevel: "read_only",
  confirmation: "none",
  handler: { kind: "navigate", urlTemplate: "/products/{id}" },
  routes: [{ pathPattern: "/**" }],
  authRequired: false,
  roles: [],
  confidence: 0.9,
  evidenceRefs: [
    primitives.find((primitive) => primitive.kind === "page")!.index,
  ],
  reasoning: "Grounded in the dynamic product route.",
};

const {
  inputSchema: _inputSchema,
  handler: _handler,
  routes: _routes,
  ...navigationWithoutSchema
} = navigation;
void _inputSchema;
void _handler;
void _routes;
const modelNavigation = {
  ...navigationWithoutSchema,
  name: "openProduct",
  handlerKind: "navigate" as const,
  urlTemplate: "/products/{id}",
  formSelector: "",
  fieldMap: [],
  routes: [{ pathPattern: "/**", requiresSelector: "" }],
  inputFields: [
    {
      name: "id",
      type: "string" as const,
      description: "The id to open",
      required: true,
      enum: [],
    },
  ],
};
const modelContactForm = {
  name: "send_contact_message",
  title: "Send contact message",
  description: "Sends the visitor's message through the contact form.",
  outputDescription: "The contact form submission result.",
  riskLevel: "state_changing" as const,
  confirmation: "recommended" as const,
  handlerKind: "form" as const,
  urlTemplate: "",
  formSelector: "#contact-form",
  fieldMap: [
    { inputName: "email", formFieldName: "email" },
    { inputName: "message", formFieldName: "message" },
  ],
  routes: [{ pathPattern: "/contact", requiresSelector: "" }],
  authRequired: false,
  roles: [],
  confidence: 0.9,
  evidenceRefs: [
    primitives.find((primitive) => primitive.kind === "form")!.index,
  ],
  reasoning: "Grounded in the uniquely selectable contact form.",
  inputFields: [
    {
      name: "email",
      type: "string" as const,
      description: "Email",
      required: true,
      enum: [],
    },
    {
      name: "message",
      type: "string" as const,
      description: "Message",
      required: true,
      enum: [],
    },
  ],
};

const env = {
  AI_MODEL: DEFAULT_AI_MODEL,
  AI_FALLBACK_MODEL: DEFAULT_AI_FALLBACK_MODEL,
  AI_GATEWAY_API_KEY: "test",
} as WorkerEnv;

describe("AI model configuration", () => {
  it("defaults to Terra with Claude Sonnet 5 as the backup", () => {
    const parsed = loadEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "x".repeat(24),
      SUPABASE_DB_URL: "postgres://user:pass@example.com:5432/postgres",
      GITHUB_APP_ID: "1",
      GITHUB_APP_PRIVATE_KEY: "x".repeat(120),
    });
    expect(parsed.AI_MODEL).toBe("openai/gpt-5.6-terra");
    expect(parsed.AI_FALLBACK_MODEL).toBe("anthropic/claude-sonnet-5");
  });

  it("rejects model names that cannot be routed through AI Gateway", () => {
    expect(() =>
      loadEnv({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "x".repeat(24),
        SUPABASE_DB_URL: "postgres://user:pass@example.com:5432/postgres",
        GITHUB_APP_ID: "1",
        GITHUB_APP_PRIVATE_KEY: "x".repeat(120),
        AI_MODEL: "gpt-5.6-terra",
      }),
    ).toThrow("provider/model format");
  });
});

describe("AiSdkProvider", () => {
  it("uses structured model output and discards hallucinated handlers", async () => {
    const hallucinated = {
      ...modelNavigation,
      name: "open_admin",
      urlTemplate: "/admin/{id}",
    };
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        output: { tools: [modelNavigation, hallucinated] },
        usage: { inputTokens: 100, outputTokens: 50 },
      })
      .mockResolvedValueOnce({
        output: { tools: [modelContactForm] },
        usage: { inputTokens: 90, outputTokens: 40 },
      });
    const result = await new AiSdkProvider(env, generate).proposeTools({
      analysis,
      primitives,
    });

    expect(result.mode).toBe("ai");
    expect(result.model).toBe("openai/gpt-5.6-terra");
    expect(result.tools).toHaveLength(4);
    expect(result.tools[0]).toMatchObject({
      name: "open_product",
      handler: { kind: "navigate", urlTemplate: "/products/{id}" },
    });
    expect(result.tools[1]).toMatchObject({
      name: "open_contact",
      handler: { kind: "navigate", urlTemplate: "/contact" },
    });
    expect(result.tools[2]).toMatchObject({
      name: "send_contact_message",
      handler: { kind: "form", formSelector: "#contact-form" },
    });
    expect(result.tools[3]).toMatchObject({
      name: "add_to_cart",
      handler: { kind: "bridge", bridgeKey: "actions.add_to_cart" },
    });
    expect(result.discarded).toBe(1);
    expect(result.supplemented).toBe(2);
    expect(result.attemptedModels).toEqual([
      "openai/gpt-5.6-terra",
      "anthropic/claude-sonnet-5",
    ]);
    expect(result.usage).toEqual({
      byModel: {
        "openai/gpt-5.6-terra": { inputTokens: 100, outputTokens: 50 },
        "anthropic/claude-sonnet-5": {
          inputTokens: 90,
          outputTokens: 40,
        },
      },
    });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("tries Claude Sonnet 5 when Terra is unavailable", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error("primary unavailable"))
      .mockResolvedValueOnce({ output: { tools: [modelNavigation] } });
    const result = await new AiSdkProvider(env, generate).proposeTools({
      analysis,
      primitives,
    });

    expect(result.model).toBe("anthropic/claude-sonnet-5");
    expect(result.attemptedModels).toEqual([
      "openai/gpt-5.6-terra",
      "anthropic/claude-sonnet-5",
    ]);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("uses the backup when Terra returns only hallucinated capabilities", async () => {
    const hallucinated = {
      ...modelNavigation,
      name: "open_admin",
      urlTemplate: "/admin/{id}",
    };
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ output: { tools: [hallucinated] } })
      .mockResolvedValueOnce({ output: { tools: [modelNavigation] } });
    const result = await new AiSdkProvider(env, generate).proposeTools({
      analysis,
      primitives,
    });

    expect(result.model).toBe("anthropic/claude-sonnet-5");
    expect(result.modelErrors?.[0]).toContain("no source-grounded");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("lets AI improve wording but never executable or security fields", async () => {
    const unsafeForm = {
      ...modelNavigation,
      name: "send_contact_message",
      title: "Send contact message",
      description:
        "Sends the visitor's contact message through the contact form.",
      outputDescription: "The contact form submission result.",
      handlerKind: "form" as const,
      urlTemplate: "",
      formSelector: "#contact-form",
      fieldMap: [
        { inputName: "email", formFieldName: "email" },
        { inputName: "message", formFieldName: "message" },
      ],
      routes: [{ pathPattern: "/contact", requiresSelector: "" }],
      riskLevel: "read_only" as const,
      confirmation: "none" as const,
      evidenceRefs: [
        primitives.find((primitive) => primitive.kind === "form")!.index,
      ],
      inputFields: [
        {
          name: "email",
          type: "string" as const,
          description: "Email",
          required: true,
          enum: [],
        },
        {
          name: "message",
          type: "string" as const,
          description: "Message",
          required: true,
          enum: [],
        },
      ],
    };
    const generate = vi.fn(async () => ({ output: { tools: [unsafeForm] } }));
    const result = await new AiSdkProvider(env, generate).proposeTools({
      analysis,
      primitives,
    });
    const tool = result.tools.find(
      (item) => item.name === "send_contact_message",
    );

    expect(tool).toMatchObject({
      title: "Send contact message",
      riskLevel: "state_changing",
      confirmation: "recommended",
      handler: {
        kind: "form",
        formSelector: "#contact-form",
        fieldMap: { email: "email", message: "message" },
      },
      routes: [{ pathPattern: "/contact" }],
    });
  });

  it("does not call the same model twice when both settings match", async () => {
    const sameModelEnv = {
      ...env,
      AI_FALLBACK_MODEL: env.AI_MODEL,
    };
    const generate = vi.fn(async () => ({
      output: { tools: [modelNavigation] },
    }));
    const result = await new AiSdkProvider(sameModelEnv, generate).proposeTools(
      {
        analysis,
        primitives,
      },
    );

    expect(result.attemptedModels).toEqual(["openai/gpt-5.6-terra"]);
    expect(generate).toHaveBeenCalledOnce();
  });

  it("keeps complete deterministic coverage when a large repo exceeds the AI prompt cap", async () => {
    const routes = Array.from({ length: 170 }, (_, index) => ({
      urlPattern: `/catalog-${index}/[id]`,
      pathPattern: `/catalog-${index}/*`,
      kind: "page" as const,
      params: ["id"],
      span: {
        filePath: `app/catalog-${index}/[id]/page.tsx`,
        startLine: 1,
        endLine: 10,
      },
    }));
    const largeAnalysis: StaticAnalysis = {
      ...analysis,
      routes,
      forms: [],
      serverActions: [],
    };
    const largePrimitives = buildPrimitives(largeAnalysis);
    const firstModelTool = {
      ...modelNavigation,
      urlTemplate: "/catalog-0/{id}",
      evidenceRefs: [0],
    };
    const generate = vi.fn(async () => ({
      output: { tools: [firstModelTool] },
    }));
    const result = await new AiSdkProvider(env, generate).proposeTools({
      analysis: largeAnalysis,
      primitives: largePrimitives,
    });

    expect(result.tools).toHaveLength(170);
    expect(result.supplemented).toBe(169);
    expect(
      result.tools.some(
        (tool) =>
          tool.handler.kind === "navigate" &&
          tool.handler.urlTemplate === "/catalog-169/{id}",
      ),
    ).toBe(true);
  });
});

describe("HeuristicAiProvider", () => {
  it("keeps server actions available behind reviewed first-party bridges", async () => {
    const result = await new HeuristicAiProvider().proposeTools({
      analysis,
      primitives,
    });

    expect(result.mode).toBe("deterministic_fallback");
    expect(result.tools.map((tool) => tool.name)).toEqual([
      "open_products",
      "open_contact",
      "submit_contact",
      "add_to_cart",
    ]);
    expect(
      result.tools.find((tool) => tool.name === "add_to_cart"),
    ).toMatchObject({
      handler: { kind: "bridge", bridgeKey: "actions.add_to_cart" },
      riskLevel: "state_changing",
      confirmation: "recommended",
    });
    expect(
      result.tools.every(
        (tool) =>
          tool.handler.kind === "navigate" ||
          tool.handler.kind === "form" ||
          tool.handler.kind === "bridge",
      ),
    ).toBe(true);
  });

  it("keeps useful static pages navigable", async () => {
    const staticAnalysis: StaticAnalysis = {
      ...analysis,
      routes: [
        ...analysis.routes,
        {
          urlPattern: "/about",
          pathPattern: "/about",
          kind: "page",
          params: [],
          span: {
            filePath: "app/about/page.tsx",
            startLine: 1,
            endLine: 20,
          },
        },
      ],
    };
    const staticPrimitives = buildPrimitives(staticAnalysis);
    const result = await new HeuristicAiProvider().proposeTools({
      analysis: staticAnalysis,
      primitives: staticPrimitives,
    });

    expect(result.tools.some((tool) => tool.name === "open_contact")).toBe(
      true,
    );
    expect(result.tools.some((tool) => tool.name === "open_about")).toBe(true);
  });

  it("completes safely when every Gateway model fails", async () => {
    const failingProvider = {
      proposeTools: vi.fn().mockRejectedValue(new Error("gateway unavailable")),
    };
    const result = await new FallbackAiProvider(
      failingProvider,
      new HeuristicAiProvider(),
    ).proposeTools({ analysis, primitives });
    expect(result.mode).toBe("deterministic_fallback");
    expect(result.fallbackReason).toContain("gateway unavailable");
    expect(result.tools.some((tool) => tool.name === "add_to_cart")).toBe(true);
  });

  it("requires every parameter in a multi-segment dynamic route", async () => {
    const multiRouteAnalysis: StaticAnalysis = {
      ...analysis,
      routes: [
        {
          urlPattern: "/shops/[shopId]/products/[productId]",
          pathPattern: "/shops/*/products/*",
          kind: "page",
          params: ["shopId", "productId"],
          span: {
            filePath: "app/shops/[shopId]/products/[productId]/page.tsx",
            startLine: 1,
            endLine: 20,
          },
        },
      ],
      forms: [],
      serverActions: [],
    };
    const multiPrimitives = buildPrimitives(multiRouteAnalysis);
    const result = await new HeuristicAiProvider().proposeTools({
      analysis: multiRouteAnalysis,
      primitives: multiPrimitives,
    });

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]).toMatchObject({
      handler: {
        kind: "navigate",
        urlTemplate: "/shops/{shopId}/products/{productId}",
      },
      inputSchema: {
        required: ["shopId", "productId"],
        properties: {
          shopId: { type: "string" },
          productId: { type: "string" },
        },
      },
    });
  });

  it("gives colliding form capabilities stable unique names", async () => {
    const duplicatedForm = {
      ...analysis.forms[0]!,
      selector: "#secondary-contact-form",
      span: {
        filePath: "app/contact/page.tsx",
        startLine: 40,
        endLine: 60,
      },
    };
    const duplicateAnalysis: StaticAnalysis = {
      ...analysis,
      routes: [],
      forms: [analysis.forms[0]!, duplicatedForm],
      serverActions: [analysis.serverActions[0]!],
    };
    const duplicatePrimitives = buildPrimitives(duplicateAnalysis);
    const result = await new HeuristicAiProvider().proposeTools({
      analysis: duplicateAnalysis,
      primitives: duplicatePrimitives,
    });

    expect(result.tools.map((tool) => tool.name)).toEqual([
      "submit_contact",
      "submit_contact_2",
    ]);
  });

  it("keeps identical selectors on different routes as distinct tools", async () => {
    const secondForm = {
      ...analysis.forms[0]!,
      urlPattern: "/feedback",
      pathPattern: "/feedback",
      routeBindings: [{ urlPattern: "/feedback", pathPattern: "/feedback" }],
      action: { kind: "unknown" as const },
      span: {
        filePath: "app/feedback/page.tsx",
        startLine: 10,
        endLine: 30,
      },
    };
    const distinctAnalysis: StaticAnalysis = {
      ...analysis,
      routes: [],
      forms: [analysis.forms[0]!, secondForm],
      serverActions: [analysis.serverActions[0]!],
    };
    const result = await new HeuristicAiProvider().proposeTools({
      analysis: distinctAnalysis,
      primitives: buildPrimitives(distinctAnalysis),
    });

    expect(result.tools).toHaveLength(2);
    expect(result.tools.map((tool) => tool.routes[0]?.pathPattern)).toEqual([
      "/contact",
      "/feedback",
    ]);
  });

  it("keeps safe zero-input forms executable", async () => {
    const zeroInputForm = {
      ...analysis.forms[0]!,
      fields: [],
      action: { kind: "unknown" as const },
    };
    const zeroInputAnalysis: StaticAnalysis = {
      ...analysis,
      routes: [],
      forms: [zeroInputForm],
      serverActions: [],
    };
    const result = await new HeuristicAiProvider().proposeTools({
      analysis: zeroInputAnalysis,
      primitives: buildPrimitives(zeroInputAnalysis),
    });

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]?.inputSchema).toMatchObject({
      properties: {},
      required: [],
    });
  });

  it("routes destructive form actions through reviewed bridges", async () => {
    const destructiveAction = {
      ...analysis.serverActions[1]!,
      name: "deleteAccount",
      params: [],
      parameters: [],
      excerpt: "export async function deleteAccount() {}",
    };
    const destructiveForm = {
      ...analysis.forms[0]!,
      fields: [],
      action: { kind: "server_action" as const, name: "deleteAccount" },
    };
    const destructiveAnalysis: StaticAnalysis = {
      ...analysis,
      routes: [],
      forms: [destructiveForm],
      serverActions: [destructiveAction],
    };
    const result = await new HeuristicAiProvider().proposeTools({
      analysis: destructiveAnalysis,
      primitives: buildPrimitives(destructiveAnalysis),
    });

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]).toMatchObject({
      riskLevel: "destructive",
      confirmation: "required",
      handler: { kind: "bridge", bridgeKey: "actions.delete_account" },
    });
  });

  it("intersects server schemas with real form controls and options", async () => {
    const schemaAnalysis: StaticAnalysis = {
      ...analysis,
      routes: [],
      forms: [
        {
          ...analysis.forms[0]!,
          fields: [
            ...analysis.forms[0]!.fields,
            {
              name: "topic",
              type: "select",
              required: false,
              options: ["support", "sales"],
            },
          ],
        },
      ],
      serverActions: [
        {
          ...analysis.serverActions[0]!,
          zodSchemaName: "contactSchema",
        },
      ],
      zodSchemas: [
        {
          name: "contactSchema",
          span: { filePath: "lib/schemas.ts", startLine: 1, endLine: 10 },
          jsonSchema: {
            type: "object",
            properties: {
              email: { type: "string", format: "email" },
              message: { type: "string", minLength: 10 },
              topic: {
                type: "string",
                enum: ["support", "sales", "feedback"],
                default: "feedback",
              },
              internalToken: { type: "string" },
            },
            required: ["email", "message", "internalToken"],
            additionalProperties: false,
          },
        },
      ],
    };
    const result = await new HeuristicAiProvider().proposeTools({
      analysis: schemaAnalysis,
      primitives: buildPrimitives(schemaAnalysis),
    });
    const schema = result.tools[0]!.inputSchema;

    expect(Object.keys(schema.properties ?? {}).sort()).toEqual([
      "email",
      "message",
      "topic",
    ]);
    expect(schema.properties?.topic).toEqual({
      type: "string",
      enum: ["support", "sales"],
    });
    expect(schema.required).toEqual(["email", "message"]);
  });

  it("proposes a reviewed bridge when only a server action exists", async () => {
    const nonExecutableAnalysis: StaticAnalysis = {
      ...analysis,
      routes: [],
      forms: [],
      serverActions: [analysis.serverActions[1]!],
    };
    const result = await new HeuristicAiProvider().proposeTools({
      analysis: nonExecutableAnalysis,
      primitives: buildPrimitives(nonExecutableAnalysis),
    });

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]).toMatchObject({
      name: "add_to_cart",
      handler: { kind: "bridge", bridgeKey: "actions.add_to_cart" },
    });
  });

  it("derives a safe flat object schema instead of inventing an input wrapper", async () => {
    const objectAction = {
      ...analysis.serverActions[1]!,
      name: "cancelOrder",
      params: ["input"],
      parameters: [
        {
          name: "input",
          typeText: "{ orderId: string; notify?: boolean }",
        },
      ],
      excerpt:
        "export async function cancelOrder(input: { orderId: string; notify?: boolean }) {}",
    };
    const objectAnalysis: StaticAnalysis = {
      ...analysis,
      routes: [],
      forms: [],
      serverActions: [objectAction],
    };
    const result = await new HeuristicAiProvider().proposeTools({
      analysis: objectAnalysis,
      primitives: buildPrimitives(objectAnalysis),
    });

    expect(result.tools[0]?.inputSchema).toEqual({
      type: "object",
      properties: {
        orderId: { type: "string" },
        notify: { type: "boolean" },
      },
      required: ["orderId"],
      additionalProperties: false,
    });
  });

  it("omits server actions whose inputs cannot be invoked without guessing", async () => {
    const unsafeAnalysis: StaticAnalysis = {
      ...analysis,
      routes: [],
      forms: [],
      serverActions: [
        {
          ...analysis.serverActions[1]!,
          params: ["input"],
          parameters: [{ name: "input", typeText: "CheckoutPayload" }],
        },
      ],
    };
    const result = await new HeuristicAiProvider().proposeTools({
      analysis: unsafeAnalysis,
      primitives: buildPrimitives(unsafeAnalysis),
    });

    expect(result.tools).toEqual([]);
  });

  it("uses analyzer-resolved schemas for named server-action inputs", async () => {
    const typedAnalysis: StaticAnalysis = {
      ...analysis,
      routes: [],
      forms: [],
      serverActions: [
        {
          ...analysis.serverActions[1]!,
          params: ["input"],
          parameters: [
            {
              name: "input",
              typeText: "CartInput",
              schema: {
                type: "object",
                properties: {
                  productId: { type: "string" },
                  quantity: { type: "number" },
                },
                required: ["productId", "quantity"],
                additionalProperties: false,
              },
            },
          ],
          excerpt: "export async function addToCart(input: CartInput) {}",
        },
      ],
    };
    const result = await new HeuristicAiProvider().proposeTools({
      analysis: typedAnalysis,
      primitives: buildPrimitives(typedAnalysis),
    });

    expect(result.tools[0]?.inputSchema).toEqual(
      typedAnalysis.serverActions[0]?.parameters?.[0]?.schema,
    );
  });

  it("uses distinct bridge keys for same-named actions in different files", async () => {
    const first = {
      ...analysis.serverActions[1]!,
      span: { filePath: "app/cart/actions.ts", startLine: 1, endLine: 4 },
    };
    const second = {
      ...analysis.serverActions[1]!,
      span: { filePath: "app/wishlist/actions.ts", startLine: 1, endLine: 4 },
    };
    const duplicateAnalysis: StaticAnalysis = {
      ...analysis,
      routes: [],
      forms: [],
      serverActions: [first, second],
    };
    const result = await new HeuristicAiProvider().proposeTools({
      analysis: duplicateAnalysis,
      primitives: buildPrimitives(duplicateAnalysis),
    });
    const keys = result.tools.map((tool) =>
      tool.handler.kind === "bridge" ? tool.handler.bridgeKey : "",
    );

    expect(new Set(keys).size).toBe(2);
    expect(keys.every((key) => key.startsWith("actions.add_to_cart_"))).toBe(
      true,
    );
  });

  it("turns source-defined links into tools even when the repo has only a root page", async () => {
    const linkOnlyAnalysis: StaticAnalysis = {
      ...analysis,
      routes: [
        {
          urlPattern: "/",
          pathPattern: "/",
          kind: "page",
          params: [],
          span: { filePath: "app/page.tsx", startLine: 1, endLine: 20 },
        },
      ],
      forms: [],
      serverActions: [],
      links: [
        {
          href: "/question-bank",
          label: "Start practicing",
          routeBindings: [{ urlPattern: "/", pathPattern: "/" }],
          span: { filePath: "app/page.tsx", startLine: 10, endLine: 12 },
          excerpt: '<Link href="/question-bank">Start practicing</Link>',
        },
      ],
    };
    const result = await new HeuristicAiProvider().proposeTools({
      analysis: linkOnlyAnalysis,
      primitives: buildPrimitives(linkOnlyAnalysis),
    });

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]).toMatchObject({
      name: "open_start_practicing",
      handler: { kind: "navigate", urlTemplate: "/question-bank" },
    });
  });
});
