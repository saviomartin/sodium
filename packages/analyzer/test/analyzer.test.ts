import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  analyzeNextJsRepo,
  detectAppDir,
  parseAppPath,
  RepoWorkspace,
  type StaticAnalysis,
} from "../src/index";
import { writeFixtureRepo } from "./fixture-repo";

let root: string;
let analysis: StaticAnalysis;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "sodium-analyzer-"));
  writeFixtureRepo(root);
  analysis = await analyzeNextJsRepo(root);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("parseAppPath", () => {
  it("maps segments", () => {
    expect(parseAppPath("")).toMatchObject({
      urlPattern: "/",
      pathPattern: "/",
    });
    expect(parseAppPath("products/[id]")).toMatchObject({
      urlPattern: "/products/[id]",
      pathPattern: "/products/*",
      params: ["id"],
    });
    expect(parseAppPath("(marketing)/about")).toMatchObject({
      urlPattern: "/about",
    });
    expect(parseAppPath("docs/[...slug]")).toMatchObject({
      pathPattern: "/docs/**",
      params: ["slug"],
    });
    expect(parseAppPath("@modal/photo")).toMatchObject({
      urlPattern: "/photo",
    });
    expect(parseAppPath("_private/tools").excluded).toBe(true);
    expect(parseAppPath("feed/(.)photo/[id]").excluded).toBe(true);
  });
});

describe("Next.js project detection", () => {
  it("finds a single app inside a monorepo package", () => {
    expect(
      detectAppDir([
        "package.json",
        "apps/web/package.json",
        "apps/web/next.config.ts",
        "apps/web/src/app/layout.tsx",
        "apps/web/src/app/page.tsx",
      ]),
    ).toBe("apps/web/src/app");
  });
});

describe("workspace trust boundary", () => {
  it("excludes secrets, env files, dependencies and ignored paths", () => {
    const files = new RepoWorkspace(root).listFiles();
    expect(files).not.toContain(".env");
    expect(files).not.toContain("secret.pem");
    expect(files.some((f) => f.startsWith("node_modules/"))).toBe(false);
    expect(files.some((f) => f.startsWith("ignored-dir/"))).toBe(false);
    // repository-level ignore file support
    expect(files.some((f) => f.startsWith("generated/"))).toBe(false);
    expect(files).toContain("app/page.tsx");
  });

  it("never follows symlinks", () => {
    const workspace = new RepoWorkspace(root);
    const files = workspace.listFiles();
    expect(files).not.toContain("sneaky-link.ts");
  });
});

describe("route extraction", () => {
  it("finds pages with correct patterns", () => {
    const pages = analysis.routes
      .filter((r) => r.kind === "page")
      .map((r) => r.urlPattern);
    expect(pages).toContain("/");
    expect(pages).toContain("/products");
    expect(pages).toContain("/products/[id]");
    expect(pages).toContain("/about");
    expect(pages).toContain("/contact");
    expect(pages.some((p) => p.includes("_components"))).toBe(false);
  });

  it("maps dynamic segments to loader patterns", () => {
    const product = analysis.routes.find(
      (r) => r.urlPattern === "/products/[id]",
    );
    expect(product?.pathPattern).toBe("/products/*");
    expect(product?.params).toEqual(["id"]);
  });
});

describe("route handlers", () => {
  it("finds function and arrow-const handlers with schema + auth evidence", () => {
    const handlers = analysis.routeHandlers.filter(
      (h) => h.urlPattern === "/api/orders",
    );
    const methods = handlers.map((h) => h.method).sort();
    expect(methods).toEqual(["GET", "POST"]);
    const post = handlers.find((h) => h.method === "POST");
    expect(post?.zodSchemaName).toBe("orderSchema");
    expect(post?.authSignals.some((s) => s.kind === "supabase_get_user")).toBe(
      true,
    );
  });
});

describe("server actions", () => {
  it("finds actions in a 'use server' file", () => {
    const names = analysis.serverActions.map((a) => a.name).sort();
    expect(names).toEqual(["cancelOrder", "submitContact", "updateProfile"]);
  });

  it("captures form-data usage and zod parsing", () => {
    const submit = analysis.serverActions.find(
      (a) => a.name === "submitContact",
    );
    expect(submit?.takesFormData).toBe(true);
    expect(submit?.zodSchemaName).toBe("contactSchema");
  });

  it("captures auth + redirect guards inside an action", () => {
    const cancel = analysis.serverActions.find((a) => a.name === "cancelOrder");
    const kinds = cancel?.authSignals.map((s) => s.kind) ?? [];
    expect(kinds).toContain("supabase_get_user");
    expect(kinds).toContain("redirect_guard");
  });

  it("resolves bounded TypeScript aliases into input schemas", () => {
    const update = analysis.serverActions.find(
      (action) => action.name === "updateProfile",
    );
    expect(update?.parameters?.[0]?.schema).toEqual({
      type: "object",
      properties: {
        displayName: { type: "string" },
        notifications: { type: "boolean" },
        visibility: { type: "string", enum: ["public", "private"] },
      },
      required: ["displayName", "visibility"],
      additionalProperties: false,
    });
  });
});

describe("forms", () => {
  it("extracts fields, requiredness, labels and select options", () => {
    const form = analysis.forms.find((f) => f.urlPattern === "/contact");
    expect(form).toBeDefined();
    expect(form?.action).toEqual({
      kind: "server_action",
      name: "submitContact",
    });
    expect(form?.selector).toBe("form");
    const byName = new Map(form!.fields.map((f) => [f.name, f]));
    expect(byName.get("name")).toMatchObject({
      type: "text",
      required: true,
      label: "Your name",
    });
    expect(byName.get("email")).toMatchObject({
      type: "email",
      required: true,
    });
    expect(byName.get("topic")?.options).toEqual(["support", "sales"]);
    expect(byName.get("message")).toMatchObject({
      type: "textarea",
      required: true,
      label: "Message",
    });
    expect(byName.has("csrfToken")).toBe(false);
  });

  it("maps forms in imported components back to every rendering page", () => {
    const form = analysis.forms.find(
      (candidate) => candidate.span.filePath === "components/FeedbackForm.tsx",
    );
    expect(form).toMatchObject({
      selector: "#feedback-form",
      urlPattern: "/support",
      pathPattern: "/support",
      routeBindings: [{ urlPattern: "/support", pathPattern: "/support" }],
    });
  });

  it("keeps zero-input forms and excludes sensitive agent-controlled fields", () => {
    const signOut = analysis.forms.find(
      (form) => form.selector === "#sign-out-form",
    );
    expect(signOut).toMatchObject({
      pathPattern: "/account",
      fields: [],
      action: { kind: "server_action", name: "signOut" },
    });
    const security = analysis.forms.find(
      (form) => form.selector === "#security-form",
    );
    expect(security?.fields.map((field) => field.name)).toEqual([
      "displayName",
    ]);
    expect(security?.hasSensitiveFields).toBe(true);
    const globalSignOut = analysis.forms.find(
      (form) => form.span.filePath === "app/layout.tsx",
    );
    expect(globalSignOut?.pathPattern).toBe("/**");
    expect(globalSignOut?.selector).toBeUndefined();
  });
});

describe("browser controls", () => {
  it("extracts stable controls while preserving page-owned closure values", () => {
    expect(analysis.controls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          selector: "#cancel-order",
          label: "Cancel order",
          actionName: "cancelOrder",
          routeBindings: [{ urlPattern: "/account", pathPattern: "/account" }],
        }),
        expect.objectContaining({
          accessibleName: "Log out everywhere",
          label: "Log out everywhere",
          actionName: "signOut",
          routeBindings: [{ urlPattern: "/account", pathPattern: "/account" }],
        }),
        expect.objectContaining({
          accessibleName: "Global sign out",
          actionName: "signOut",
          routeBindings: [{ urlPattern: "/**", pathPattern: "/**" }],
        }),
      ]),
    );
    expect(
      analysis.warnings.filter((warning) =>
        warning.includes("needs a stable id, name, or action attribute"),
      ),
    ).toEqual([]);
  });
});

describe("links", () => {
  it("extracts literal same-origin navigation and rejects external links", () => {
    expect(analysis.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: "/products",
          label: "Browse products",
          routeBindings: [{ urlPattern: "/", pathPattern: "/" }],
        }),
      ]),
    );
    expect(analysis.links.some((link) => link.href.startsWith("http"))).toBe(
      false,
    );
  });
});

describe("zod schema conversion", () => {
  it("converts contactSchema statically", () => {
    const contact = analysis.zodSchemas.find((s) => s.name === "contactSchema");
    expect(contact?.jsonSchema).toEqual({
      type: "object",
      additionalProperties: false,
      properties: {
        name: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Full name",
        },
        email: { type: "string", format: "email" },
        topic: {
          type: "string",
          enum: ["support", "sales", "feedback"],
          default: "support",
        },
        message: { type: "string", minLength: 10, maxLength: 2000 },
      },
      required: ["name", "email", "message"],
    });
  });

  it("converts numeric and optional constraints", () => {
    const order = analysis.zodSchemas.find((s) => s.name === "orderSchema");
    expect(order?.jsonSchema?.properties?.quantity).toEqual({
      type: "integer",
      minimum: 1,
      maximum: 10,
    });
    expect(order?.jsonSchema?.properties?.productId).toEqual({
      type: "string",
      format: "uuid",
    });
    expect(order?.jsonSchema?.required).toEqual(["productId", "quantity"]);
  });
});

describe("auth signals", () => {
  it("detects request-level proxy", () => {
    expect(
      analysis.authSignals.some((s) => s.kind === "proxy_middleware"),
    ).toBe(true);
    expect(
      analysis.authSignals.some((s) => s.kind === "supabase_get_claims"),
    ).toBe(true);
  });
});
