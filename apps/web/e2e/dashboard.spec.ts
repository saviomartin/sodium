import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { compileSodiumConfig } from "sodium-webmcp-spec";
import { verifySignedDeploymentReceipt } from "sodium-webmcp-spec/signing";
import { adminClient, readState, signIn } from "./helpers";

const developmentSigningKey = JSON.parse(
  readFileSync(
    new URL(
      "../../../packages/runtime/keys/dev-deployment-key.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { privateKeyPem: string };
const developmentPublicKey = createPublicKey(
  createPrivateKey(developmentSigningKey.privateKeyPem),
)
  .export({ type: "spki", format: "pem" })
  .toString();

test.describe.configure({ mode: "serial" });

test("signed-out home explains the file-first workflow", async ({ page }) => {
  await page.goto("/");
  // The headline's animated copy is aria-hidden, so its accessible name is the
  // static sentence beside it that names every agent once.
  await expect(
    page.getByRole("heading", { name: /Make your website usable by/ }),
  ).toBeVisible();
  await expect(
    page.getByText("npx sodiumtools init", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("npx sodiumtools deploy", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(/never requests repository access/),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "FAQ" })).toBeVisible();
  // The two features that are designed but not yet wired still have to be
  // findable, because the marketing page makes a promise about them.
  await expect(
    page.getByRole("heading", { name: "Immutable deployment history" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Answer engine referrals" }),
  ).toBeVisible();
  // There is no sign-in panel on the page any more; the header is the door.
  await page.locator("summary").filter({ hasText: "Sign in" }).click();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with GitHub" }),
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
  const publishableKey = `sod_pk_${"c".repeat(32)}`;
  const sessionId = crypto.randomUUID();
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
    publishable_key_hash: createHash("sha256")
      .update(publishableKey)
      .digest("hex"),
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

  const referralPayload = JSON.stringify({
    projectId,
    key: publishableKey,
    deploymentId,
    configVersion: 1,
    sdkVersion: "0.1.0",
    event: "answer_engine_referral",
    sessionId,
    answerEngine: "ChatGPT",
    attributionMethod: "referrer",
    ts: Date.now(),
  });
  const referralResponse = await page.request.post("/api/events", {
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      origin: "https://example.com",
    },
    data: referralPayload,
  });
  expect(referralResponse.status()).toBe(202);
  const duplicateReferral = await page.request.post("/api/events", {
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      origin: "https://example.com",
    },
    data: referralPayload,
  });
  expect(duplicateReferral.status()).toBe(202);

  const invocationId = crypto.randomUUID();
  const base = {
    project_id: projectId,
    deployment_id: deploymentId,
    config_version: 1,
    sdk_version: "0.1.0",
    tool_id: "tl_checkout",
    tool_name: "start_checkout",
    invocation_id: invocationId,
    session_id: sessionId,
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
  const { data: persistedReferral, error: referralError } = await admin
    .from("usage_events")
    .select("answer_engine, attribution_method, session_id")
    .eq("project_id", projectId)
    .eq("event", "answer_engine_referral")
    .single();
  if (referralError) throw referralError;
  expect(persistedReferral).toEqual({
    answer_engine: "ChatGPT",
    attribution_method: "referrer",
    session_id: sessionId,
  });

  await signIn(page, users.owner.email);
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.getByRole("link", { name: /Fixture shop/ }).click();
  await expect(
    page.getByRole("heading", { name: "Fixture shop" }),
  ).toBeVisible();
  await expect(page.getByText("100%").first()).toBeVisible();
  await expect(page.getByText("84 ms").first()).toBeVisible();
  await expect(page.getByText("1 tool registration")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Answer engine referrals" }),
  ).toBeVisible();
  const referralRow = page.getByRole("row", { name: /ChatGPT/ });
  await expect(referralRow).toContainText("chatgpt.com");
  await expect(referralRow).toContainText("Referrer");
  await expect(referralRow).toContainText("100%");

  // The tool row opens the contract the deployment actually published.
  await page.getByRole("button", { name: /Start checkout/ }).click();
  const details = page.getByRole("dialog", { name: /Start checkout/ });
  await expect(details).toBeVisible();
  // `financial` forces the confirmation floor, and `run.navigate` is the
  // mechanism the fixture declares.
  await expect(details.getByText("Prompt required")).toBeVisible();
  await expect(details.getByText("navigate", { exact: true })).toBeVisible();
  await details.getByRole("button", { name: "Close" }).click();
  await expect(details).toBeHidden();

  await page.getByRole("link", { name: "7d" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}\\?range=7d`));
  await expect(
    page.getByRole("heading", { name: "Agent analytics" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Delete project" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete Fixture shop?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").fill("Fixture shop");
  await dialog.getByRole("button", { name: "Delete project" }).click();
  // Home, carrying the confirmation the notice renders. Going via /dashboard
  // used to drop the query string and say nothing at all.
  await expect(page).toHaveURL(/\/\?deleted=project$/);
  await expect(page.getByRole("status")).toContainText(/deleted/i);

  const [projectCount, deploymentCount, eventCount] = await Promise.all([
    admin
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("id", projectId),
    admin
      .from("deployments")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
    admin
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
  ]);
  expect(projectCount.count).toBe(0);
  expect(deploymentCount.count).toBe(0);
  expect(eventCount.count).toBe(0);
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

test("device authorization requires sign-in before approval", async ({
  page,
}) => {
  const { users } = readState();
  const admin = adminClient();
  const code = "AUTH-TEST";
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

  await page.context().clearCookies();
  await page.goto(`/activate?code=${code}`);
  await expect(
    page.getByRole("heading", { name: "Sign in before authorizing" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Authorize this device" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();

  const { data: before } = await admin
    .from("cli_auth_requests")
    .select("user_id, authorized_at")
    .eq("id", request.id)
    .single();
  expect(before).toEqual({ user_id: null, authorized_at: null });

  await signIn(page, users.owner.email, `/activate?code=${code}`);
  await expect(
    page.getByRole("button", { name: "Authorize this device" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Authorize this device" }).click();
  await expect(
    page.getByRole("heading", { name: "CLI authorized" }),
  ).toBeVisible();
});

test("deployment API persists and returns a verifiable signed receipt", async ({
  page,
}) => {
  const { users } = readState();
  const admin = adminClient();
  const apiToken = `sod_cli_${randomBytes(32).toString("base64url")}`;
  const { error: tokenError } = await admin.from("api_tokens").insert({
    owner_id: users.owner.id,
    token_hash: createHash("sha256").update(apiToken).digest("hex"),
    last_four: apiToken.slice(-4),
  });
  if (tokenError) throw tokenError;

  const projectResponse = await page.request.post("/api/v1/projects", {
    headers: { authorization: `Bearer ${apiToken}` },
    data: { name: `Signed fixture ${Date.now().toString(36)}` },
  });
  expect(projectResponse.status()).toBe(200);
  const project = (await projectResponse.json()) as { projectId: string };
  expect(project.projectId).toMatch(/^prj_[a-z0-9]{12}$/);

  const config = {
    schemaVersion: 1,
    app: {
      name: "Signed fixture",
      origins: ["https://fixture.example"],
    },
    tools: [
      {
        id: "tl_signed01",
        name: "read_status",
        description: "Reads the current fixture status from the visible page.",
        run: {
          extract: { fields: [{ name: "status", selector: "#status" }] },
        },
        risk: "read_only",
      },
    ],
  };
  const configHash = createHash("sha256")
    .update(JSON.stringify(compileSodiumConfig(config)))
    .digest("hex");

  const mismatch = await page.request.post(
    `/api/v1/projects/${project.projectId}/deployments`,
    {
      headers: { authorization: `Bearer ${apiToken}` },
      data: { config, configHash: "0".repeat(64) },
    },
  );
  expect(mismatch.status()).toBe(409);

  const deploymentResponse = await page.request.post(
    `/api/v1/projects/${project.projectId}/deployments`,
    {
      headers: { authorization: `Bearer ${apiToken}` },
      data: { config, configHash },
    },
  );
  expect(deploymentResponse.status()).toBe(200);
  const deployment = (await deploymentResponse.json()) as {
    id: string;
    version: number;
    configHash: string;
    receipt: unknown;
  };
  expect(deployment).toMatchObject({ version: 1, configHash });
  expect(
    verifySignedDeploymentReceipt(deployment.receipt, developmentPublicKey),
  ).toEqual({
    receiptVersion: 1,
    projectId: project.projectId,
    deploymentId: deployment.id,
    version: 1,
    configHash,
    origins: config.app.origins,
  });

  const { data: persisted, error: persistedError } = await admin
    .from("deployments")
    .select("id, version, config_hash, tool_count")
    .eq("id", deployment.id)
    .single();
  if (persistedError) throw persistedError;
  expect(persisted).toEqual({
    id: deployment.id,
    version: 1,
    config_hash: configHash,
    tool_count: 1,
  });
});
