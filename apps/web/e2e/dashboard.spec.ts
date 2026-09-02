import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminClient, readState, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("signed-out home explains the file-first workflow", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: /Turn real product flows into tools agents can use/,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("npx sodium-webmcp init", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(/never requests repository access/),
  ).toBeVisible();
});

test("project dashboard reports tool outcomes and deployment history", async ({
  page,
}) => {
  const { users } = readState();
  const admin = adminClient();
  const stamp = `${Date.now().toString(36)}abcd`;
  const projectId = `prj_${stamp}`;
  const deploymentId = `dep_${stamp}aa`;
  const config = {
    schemaVersion: 1,
    app: { name: "Fixture shop", origins: ["https://example.com"] },
    telemetry: { enabled: true },
    tools: [
      {
        id: "tl_checkout",
        name: "start_checkout",
        title: "Start checkout",
        description: "Starts checkout for the selected cart.",
        on: ["/**"],
        input: {},
        run: { navigate: "/checkout" },
        risk: "financial",
        confirmation: "required",
      },
    ],
  };
  const { error: projectError } = await admin.from("projects").insert({
    id: projectId,
    owner_id: users.owner.id,
    name: "Fixture shop",
    publishable_key_hash: "a".repeat(64),
  });
  if (projectError) throw projectError;
  const { error: deploymentError } = await admin.from("deployments").insert({
    id: deploymentId,
    project_id: projectId,
    version: 1,
    config_hash: "b".repeat(64),
    config,
    tool_count: 1,
  });
  if (deploymentError) throw deploymentError;
  const { error: currentDeploymentError } = await admin
    .from("projects")
    .update({ current_deployment_id: deploymentId })
    .eq("id", projectId);
  if (currentDeploymentError) throw currentDeploymentError;
  const invocationId = crypto.randomUUID();
  const base = {
    project_id: projectId,
    deployment_id: deploymentId,
    config_version: 1,
    sdk_version: "0.1.0",
    tool_id: "tl_checkout",
    tool_name: "start_checkout",
    invocation_id: invocationId,
    occurred_at: new Date().toISOString(),
  };
  const { error: eventError } = await admin.from("usage_events").insert([
    {
      ...base,
      event: "sdk_ready",
      tool_id: null,
      tool_name: null,
      invocation_id: null,
    },
    { ...base, event: "tool_registered", invocation_id: null },
    { ...base, event: "tool_started" },
    { ...base, event: "tool_succeeded", duration_ms: 84 },
  ]);
  if (eventError) throw eventError;

  await signIn(page, users.owner.email);
  await expect(
    page.getByRole("heading", { name: "WebMCP projects" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Fixture shop/ }).click();
  await expect(
    page.getByRole("heading", { name: "Fixture shop" }),
  ).toBeVisible();
  await expect(page.getByText("100%").first()).toBeVisible();
  await expect(page.getByText("84 ms").first()).toBeVisible();
  await expect(page.getByText("1 successful")).toBeVisible();
  await expect(page.getByText("Start checkout").last()).toBeVisible();
  await page.getByRole("link", { name: "7d" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}\\?range=7d`));
  await expect(
    page.getByRole("heading", { name: "Agent analytics" }),
  ).toBeVisible();
});

test("device authorization binds one valid CLI request to the signed-in user", async ({
  page,
}) => {
  const { users } = readState();
  const admin = adminClient();
  const code = "TEST-CODE";
  const { data: request, error } = await admin
    .from("cli_auth_requests")
    .insert({
      device_hash: createHash("sha256")
        .update(crypto.randomUUID())
        .digest("hex"),
      user_code: code,
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !request) throw error;

  await signIn(page, users.owner.email);
  await page.goto(`/activate?code=${code}`);
  await page.getByRole("button", { name: "Authorize this device" }).click();
  await expect(
    page.getByRole("heading", { name: "CLI authorized" }),
  ).toBeVisible();
  const { data: authorized } = await admin
    .from("cli_auth_requests")
    .select("user_id, authorized_at")
    .eq("id", request.id)
    .single();
  expect(authorized?.user_id).toBe(users.owner.id);
  expect(authorized?.authorized_at).not.toBeNull();
});
