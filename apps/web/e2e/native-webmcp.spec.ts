import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { NATIVE_WEBMCP_TOOL_DEFINITIONS } from "../lib/native-webmcp";
import { adminClient, readState, signIn } from "./helpers";

interface CapturedTool {
  name: string;
  execute(
    input: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<unknown>;
}

interface WebMcpTestWindow {
  __capturedWebMcpTools: Map<string, CapturedTool>;
  __sodiumWebMcp?: {
    getStatus(): {
      phase: string;
      registeredCount: number;
      toolCount: number;
      apiSurface: string | null;
      errors: string[];
    };
  };
}

async function installNativeWebMcpCapture(page: Page) {
  await page.addInitScript(() => {
    const tools = new Map<string, CapturedTool>();
    Object.defineProperty(window, "__capturedWebMcpTools", {
      configurable: true,
      value: tools,
    });
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        async registerTool(
          definition: CapturedTool,
          options?: { signal?: AbortSignal },
        ) {
          if (tools.has(definition.name)) {
            throw new DOMException(
              `Tool ${definition.name} is already registered.`,
              "InvalidStateError",
            );
          }
          tools.set(definition.name, definition);
          options?.signal?.addEventListener(
            "abort",
            () => {
              if (tools.get(definition.name) === definition) {
                tools.delete(definition.name);
              }
            },
            { once: true },
          );
        },
      },
    });
  });
}

async function toolNames(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(
      (window as unknown as WebMcpTestWindow).__capturedWebMcpTools.keys(),
    ).sort(),
  );
}

async function callTool(
  page: Page,
  name: string,
  input: Record<string, unknown> = {},
): Promise<unknown> {
  return page.evaluate(
    async ({ toolName, toolInput }) => {
      const tool = (
        window as unknown as WebMcpTestWindow
      ).__capturedWebMcpTools.get(toolName);
      if (!tool) throw new Error(`WebMCP tool ${toolName} was not registered.`);
      return tool.execute(toolInput);
    },
    { toolName: name, toolInput: input },
  );
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await installNativeWebMcpCapture(page);
});

test("registers the complete contract before hydration and keeps it across navigation", async ({
  page,
}) => {
  await page.goto("/");
  const expectedNames = NATIVE_WEBMCP_TOOL_DEFINITIONS.map(
    (tool) => tool.name,
  ).sort();
  await expect.poll(() => toolNames(page)).toEqual(expectedNames);

  await expect(
    callTool(page, "sodium_describe_capabilities"),
  ).resolves.toMatchObject({
    ok: true,
    standard: "WebMCP",
    toolCount: expectedNames.length,
  });
  await expect(callTool(page, "sodium_get_app_state")).resolves.toMatchObject({
    ok: true,
    authenticated: false,
    account: null,
  });
  await expect(
    callTool(page, "sodium_get_project", {
      projectId: "prj_abcdefgh",
      days: 14,
    }),
  ).resolves.toEqual({ ok: false, error: "invalid_input" });

  await expect(
    callTool(page, "sodium_navigate", { destination: "settings" }),
  ).resolves.toEqual({ ok: true, path: "/settings" });
  await page.waitForURL(/\/\?next=%2Fsettings$/);
  await expect.poll(() => toolNames(page)).toEqual(expectedNames);
  await expect(
    page.evaluate(() =>
      (window as unknown as WebMcpTestWindow).__sodiumWebMcp?.getStatus(),
    ),
  ).resolves.toMatchObject({
    phase: "ready",
    registeredCount: expectedNames.length,
    toolCount: expectedNames.length,
    apiSurface: "document",
    errors: [],
  });
});

test("uses the signed-in session and enforces mutation confirmations", async ({
  page,
}) => {
  const admin = adminClient();
  const { users } = readState();
  const projectId = `prj_${Date.now().toString(36)}wmcp`;
  const projectName = "Disposable WebMCP project";
  const { error: insertError } = await admin.from("projects").insert({
    id: projectId,
    owner_id: users.owner.id,
    name: projectName,
    publishable_key_hash: createHash("sha256")
      .update(`webmcp-${projectId}`)
      .digest("hex"),
  });
  if (insertError) throw insertError;

  await signIn(page, users.owner.email);
  await expect(callTool(page, "sodium_list_projects")).resolves.toMatchObject({
    ok: true,
    projects: expect.arrayContaining([
      expect.objectContaining({ id: projectId, name: projectName }),
    ]),
  });
  await expect(
    callTool(page, "sodium_delete_project", {
      projectId,
      confirmation: "wrong name",
    }),
  ).resolves.toMatchObject({
    ok: false,
    error: "confirmation_mismatch",
    requiredConfirmation: projectName,
  });
  const { count: preservedCount } = await admin
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("id", projectId);
  expect(preservedCount).toBe(1);

  await expect(
    callTool(page, "sodium_delete_project", {
      projectId,
      confirmation: projectName,
    }),
  ).resolves.toMatchObject({ ok: true, deletedProjectId: projectId });
  await page.waitForURL(/\/\?deleted=project$/);
  const { count: deletedCount } = await admin
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("id", projectId);
  expect(deletedCount).toBe(0);

  await expect(
    callTool(page, "sodium_sign_out", { confirmed: true }),
  ).resolves.toEqual({ ok: true });
  await page.waitForURL(/\/$/);
  await expect(callTool(page, "sodium_get_app_state")).resolves.toMatchObject({
    ok: true,
    authenticated: false,
    account: null,
  });
});
