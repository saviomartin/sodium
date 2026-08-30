import { expect, test } from "@playwright/test";
import Stripe from "stripe";
import type { ActionContract } from "@sodium/contracts";
import { adminClient, loadWebEnv, readState, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

const state = () => readState();

const submitContact: ActionContract = {
  contractVersion: 2,
  actionId: "act_0123456789abcdef",
  name: "submit_contact",
  title: "Submit contact",
  description:
    "Submits the public contact form using the same fields a visitor completes.",
  inputSchema: {
    type: "object",
    properties: {
      email: { type: "string", format: "email" },
      message: { type: "string" },
    },
    required: ["email", "message"],
    additionalProperties: false,
  },
  output: {
    description: "Contact form submission acknowledgement.",
    schema: {
      type: "object",
      properties: {
        ok: { type: "boolean", const: true },
        submitted: { type: "boolean", const: true },
      },
      required: ["ok", "submitted"],
      additionalProperties: false,
    },
  },
  evidence: [
    {
      kind: "source",
      primitive: "form",
      filePath: "app/contact/page.tsx",
      startLine: 10,
      endLine: 30,
      snippetSha256: "a".repeat(64),
      excerpt: '<form id="contact-form" action={submitContact}>',
      summary: "Public contact form with a stable selector.",
    },
  ],
  routes: [{ pathPattern: "/contact" }],
  auth: { required: false, roles: [] },
  riskLevel: "state_changing",
  confirmation: "recommended",
  handler: {
    kind: "form",
    formSelector: "#contact-form",
    fieldMap: { email: "email", message: "message" },
  },
  confidence: 0.91,
};

async function provisionRepository(userId: string, paid = true) {
  const admin = adminClient();
  const { data: membership, error: membershipError } = await admin
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .single();
  if (membershipError || !membership) throw membershipError;

  const unique = Number(String(Date.now()).slice(-11));
  const { data: connectionId, error: connectionError } = await admin.rpc(
    "upsert_github_connection",
    {
      p_org_id: membership.org_id,
      p_github_user_id: unique,
      p_github_login: "foundative",
      p_github_email: "owner@example.com",
      p_scopes: ["repo", "user:email"],
      p_access_token: `gho_${"x".repeat(36)}`,
      p_refresh_token: "",
      p_created_by: userId,
    },
  );
  if (connectionError || !connectionId) throw connectionError;

  const { data: repository, error: repositoryError } = await admin
    .from("repositories")
    .insert({
      org_id: membership.org_id,
      github_connection_id: connectionId,
      github_repo_id: unique,
      owner: "foundative",
      name: "webmcp-fixture-shop",
      full_name: "foundative/webmcp-fixture-shop",
      default_branch: "main",
      is_private: true,
    })
    .select("id")
    .single();
  if (repositoryError || !repository) throw repositoryError;

  if (paid) {
    const { error: billingError } = await admin
      .from("repository_billing")
      .insert({
        repository_id: repository.id,
        org_id: membership.org_id,
        purchased_by: userId,
        stripe_customer_id: `cus_e2e${String(unique).slice(-8)}`,
        stripe_subscription_id: `sub_e2e${String(unique).slice(-8)}`,
        stripe_price_id: `price_e2e${String(unique).slice(-8)}`,
        status: "active",
        cancel_at_period_end: false,
      });
    if (billingError) throw billingError;
  }

  const { data: site, error: siteError } = await admin
    .from("sites")
    .insert({
      org_id: membership.org_id,
      repository_id: repository.id,
      site_id: `site_e2e${String(unique).slice(-8)}`,
      allowed_origins: ["https://example.com"],
    })
    .select("id, site_id")
    .single();
  if (siteError || !site) throw siteError;

  const sha = "c".repeat(40);
  const { data: commit, error: commitError } = await admin
    .from("repository_commits")
    .insert({
      repository_id: repository.id,
      org_id: membership.org_id,
      sha,
      ref: "main",
    })
    .select("id")
    .single();
  if (commitError || !commit) throw commitError;

  const { data: run, error: runError } = await admin
    .from("analysis_runs")
    .insert({
      repository_id: repository.id,
      org_id: membership.org_id,
      commit_id: commit.id,
      requested_by: userId,
      status: "running",
      stage: "static",
      stage_statuses: {
        clone: { status: "succeeded", message: "21 files" },
        static: { status: "running", message: "Scanning source" },
      },
    })
    .select("id")
    .single();
  if (runError || !run) throw runError;

  const { data: candidate, error: candidateError } = await admin
    .from("action_candidates")
    .insert({
      run_id: run.id,
      org_id: membership.org_id,
      action_id: submitContact.actionId,
      name: submitContact.name,
      title: submitContact.title,
      description: submitContact.description,
      contract: submitContact,
      risk_level: submitContact.riskLevel,
      confirmation: submitContact.confirmation,
      confidence: submitContact.confidence,
      status: "needs_review",
    })
    .select("id")
    .single();
  if (candidateError || !candidate) throw candidateError;

  return {
    admin,
    workspaceId: membership.org_id,
    connectionId,
    repositoryId: repository.id,
    runId: run.id,
    candidateId: candidate.id,
    siteId: site.id,
    sitePublicId: site.site_id,
  };
}

test("analysis returns to the repo and edits publish explicitly", async ({
  page,
  context,
}) => {
  const { users } = state();
  await signIn(page, users.owner.email);

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Reconnect GitHub" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with GitHub" }),
  ).toBeVisible();
  await expect(page.getByText(/create.*organization/i)).toHaveCount(0);
  await page.getByLabel("Open account menu").click();
  await expect(page.getByText(users.owner.email)).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/$/);

  const seeded = await provisionRepository(users.owner.id);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Connected repositories" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "foundative/webmcp-fixture-shop",
    }),
  ).toHaveAttribute("href", `/repos/${seeded.repositoryId}`);
  await expect(
    page.getByRole("link", { name: "New repository" }),
  ).toHaveAttribute("href", "/?add=1");

  await page.getByRole("link", { name: "New repository" }).click();
  await expect(
    page.getByRole("heading", { name: "foundative repositories" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add account" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: /Update access/ })).toHaveCount(
    0,
  );

  await page.goto(`/repos/${seeded.repositoryId}/runs/${seeded.runId}`);
  await expect(page.getByText("Static analysis")).toBeVisible();
  await expect(
    page.getByText("running", { exact: true }).first(),
  ).toBeVisible();

  await seeded.admin
    .from("analysis_runs")
    .update({
      status: "succeeded",
      stage: "validate",
      stage_statuses: {
        clone: { status: "succeeded", message: "21 files" },
        static: { status: "succeeded", message: "7 routes, 3 actions" },
        synthesize: { status: "succeeded", message: "1 candidate" },
        validate: { status: "succeeded", message: "1 ready for review" },
      },
      finished_at: new Date().toISOString(),
    })
    .eq("id", seeded.runId);

  // No page.reload(): reconciliation detects completion and the server route
  // sends the user back to the repository's single decision surface.
  await expect(page).toHaveURL(new RegExp(`/repos/${seeded.repositoryId}$`), {
    timeout: 10_000,
  });
  await expect(
    page.getByRole("button", { name: "Submit contact" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Install & access" }),
  ).toBeVisible();

  const snippet = page.locator("pre").filter({ hasText: seeded.sitePublicId });
  await expect(snippet).toContainText("/agent/v1.js");
  await expect(snippet).toContainText(`data-site="${seeded.sitePublicId}"`);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy snippet" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();

  const enableToggle = page.getByRole("checkbox", {
    name: "Enable Submit contact",
  });
  await enableToggle.check();
  const enabledToolToggle = page.getByRole("checkbox", {
    name: "Disable Submit contact",
  });
  await expect(enabledToolToggle).toBeChecked({ timeout: 15_000 });
  // The checkbox updates optimistically. Wait for the server action and RSC
  // refresh to finish before asserting the server-derived publication state.
  await expect(enabledToolToggle).toBeEnabled({ timeout: 15_000 });
  await expect(
    page.getByText("Unpublished tool or origin changes are ready."),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Publish now" }).click();
  await page.getByRole("button", { name: "Publish manifest" }).click();
  await expect(
    page.getByText("Live settings match your current edits."),
  ).toBeVisible();

  const manifestResponse = await page.request.get(
    `/api/m/${seeded.sitePublicId}`,
  );
  expect(manifestResponse.ok()).toBeTruthy();
  const envelope = (await manifestResponse.json()) as {
    algorithm: string;
    payload: string;
    signature: string;
  };
  expect(envelope).toMatchObject({
    algorithm: "Ed25519",
  });
  expect(envelope.signature).toBeTruthy();
  const publicManifest = JSON.parse(
    Buffer.from(envelope.payload, "base64url").toString("utf8"),
  ) as unknown;
  expect(publicManifest).toMatchObject({
    siteId: seeded.sitePublicId,
    origins: ["https://example.com"],
    tools: [{ name: "submit_contact" }],
  });

  const origins = page.getByRole("textbox", { name: "Add an origin" });
  await origins.fill("https://staging.example.com");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByText("Saved. Republish to make this live."),
  ).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => {
      const { data: liveSite } = await seeded.admin
        .from("sites")
        .select("allowed_origins")
        .eq("id", seeded.siteId)
        .single();
      return liveSite?.allowed_origins;
    })
    .toEqual(["https://example.com", "https://staging.example.com"]);

  const { data: beforeRepublish } = await seeded.admin
    .from("manifests")
    .select("version")
    .eq("site_id", seeded.siteId)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  await page.getByRole("button", { name: "Republish now" }).click();
  await page.getByRole("button", { name: "Publish manifest" }).click();
  await expect
    .poll(async () => {
      const { data } = await seeded.admin
        .from("manifests")
        .select("version")
        .eq("site_id", seeded.siteId)
        .order("version", { ascending: false })
        .limit(1)
        .single();
      return data?.version ?? 0;
    })
    .toBe((beforeRepublish?.version ?? 0) + 1);
  const republishedResponse = await page.request.get(
    `/api/m/${seeded.sitePublicId}`,
  );
  const republishedEnvelope = (await republishedResponse.json()) as {
    payload: string;
  };
  const republishedManifest = JSON.parse(
    Buffer.from(republishedEnvelope.payload, "base64url").toString("utf8"),
  ) as { origins: string[] };
  expect(republishedManifest.origins).toEqual([
    "https://example.com",
    "https://staging.example.com",
  ]);

  await seeded.admin.from("usage_events").insert({
    org_id: seeded.workspaceId,
    site_id: seeded.siteId,
    event: "loader_ready",
    data: { origin: "https://example.com" },
  });
  await seeded.admin.from("usage_events").insert([
    {
      org_id: seeded.workspaceId,
      site_id: seeded.siteId,
      event: "tool_invoked",
      data: { tool: "submit_contact", ok: true, ms: 84 },
    },
    {
      org_id: seeded.workspaceId,
      site_id: seeded.siteId,
      event: "answer_engine_referral",
      data: { engine: "ChatGPT", method: "campaign" },
    },
  ]);
  await page.reload();
  await expect(page.getByText(/Loader last ready/)).toBeVisible();

  const agentAnalytics = page.locator("#agent-analytics");
  await expect(
    agentAnalytics.getByRole("heading", { name: "Agent analytics" }),
  ).toBeVisible();
  await expect(
    agentAnalytics.getByText("ChatGPT", { exact: true }),
  ).toBeVisible();
  await expect(agentAnalytics.getByText("submit_contact")).toBeVisible();
  await expect(page.getByRole("link", { name: "Agent analytics" })).toHaveCount(
    0,
  );
  await expect(
    agentAnalytics.getByRole("link", { name: "7d" }),
  ).toHaveAttribute(
    "href",
    `/repos/${seeded.repositoryId}?range=7d#agent-analytics`,
  );
  const removedAnalyticsPage = await page.request.get(
    `/repos/${seeded.repositoryId}/analytics`,
  );
  expect(removedAnalyticsPage.status()).toBe(404);

  await page.getByText("Versions, rollback & activity").click();
  await expect(page.getByText("Loader activity")).toBeVisible();
  await expect(page.getByText(/loader_ready/)).toBeVisible();
  await page.getByRole("button", { name: "Roll back to this" }).first().click();
  await page.getByRole("button", { name: "Roll back", exact: true }).click();
  await expect
    .poll(async () => {
      const { data } = await seeded.admin
        .from("manifest_deployments")
        .select("action")
        .eq("site_id", seeded.siteId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      return data?.action;
    })
    .toBe("rollback");

  await expect(
    page.getByText(/Every published tool executes through this script/),
  ).toBeVisible();
  await expect(page.getByText(/Integration PR/)).toHaveCount(0);

  await page.getByRole("button", { name: "Submit contact" }).click();
  const toolDialog = page.getByRole("dialog", { name: "Submit contact" });
  await expect(toolDialog).toBeVisible();
  await expect(
    toolDialog.getByText("available", { exact: true }),
  ).toBeVisible();
  await expect(
    toolDialog.getByRole("heading", { name: "Source evidence" }),
  ).toBeVisible();
  await expect(
    toolDialog.getByRole("button", { name: /approve|publish|reject/i }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/repos/${seeded.repositoryId}$`));
  await toolDialog.getByRole("button", { name: "Close" }).click();
  await expect(toolDialog).not.toBeVisible();

  const disableToggle = page.getByRole("checkbox", {
    name: "Disable Submit contact",
  });
  await disableToggle.uncheck();
  await expect(
    page.getByRole("checkbox", { name: "Enable Submit contact" }),
  ).not.toBeChecked({ timeout: 15_000 });
  await page.getByRole("checkbox", { name: "Enable Submit contact" }).check();
  await expect(
    page.getByRole("checkbox", { name: "Disable Submit contact" }),
  ).toBeChecked({ timeout: 15_000 });
  await page
    .getByRole("checkbox", { name: "Disable Submit contact" })
    .uncheck();
  await expect(
    page.getByRole("checkbox", { name: "Enable Submit contact" }),
  ).not.toBeChecked({ timeout: 15_000 });
  await expect(
    page.getByText("Unpublished tool or origin changes are ready."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Republish now" }).click();
  await page.getByRole("button", { name: "Publish manifest" }).click();
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `/api/m/${seeded.sitePublicId}`,
        );
        if (!response.ok()) return -1;
        const currentEnvelope = (await response.json()) as {
          payload?: unknown;
        };
        if (typeof currentEnvelope.payload !== "string") return -1;
        const currentManifest = JSON.parse(
          Buffer.from(currentEnvelope.payload, "base64url").toString("utf8"),
        ) as { tools: unknown[] };
        return currentManifest.tools.length;
      },
      { timeout: 15_000 },
    )
    .toBe(0);

  const removedPublishPage = await page.goto(
    `/repos/${seeded.repositoryId}/publish`,
  );
  expect(removedPublishPage?.status()).toBe(404);

  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("button", { name: "Login with GitHub" }),
  ).toBeVisible();
});

test("legacy empty analyses require reanalysis instead of claiming no tools exist", async ({
  page,
}) => {
  const { users } = state();
  await signIn(page, users.owner.email);
  const seeded = await provisionRepository(users.owner.id);
  await seeded.admin
    .from("action_candidates")
    .delete()
    .eq("id", seeded.candidateId);
  await seeded.admin
    .from("analysis_runs")
    .update({
      status: "succeeded",
      stage: "validate",
      stage_statuses: {
        clone: { status: "succeeded", message: "21 files" },
        static: {
          status: "succeeded",
          message: "7 routes, 3 actions",
          routes: 7,
          serverActions: 3,
        },
        synthesize: { status: "succeeded", proposed: 0 },
        validate: { status: "succeeded", total: 0 },
      },
      finished_at: new Date().toISOString(),
    })
    .eq("id", seeded.runId);

  await page.goto(`/repos/${seeded.repositoryId}`);
  await expect(
    page.getByText("Reanalysis required", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/discarded every tool/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run analysis" }),
  ).toBeVisible();
  await expect(
    page.getByText("No executable tools found", { exact: true }),
  ).toHaveCount(0);
});

test("a new repository opens pricing before any analysis is created", async ({
  page,
}) => {
  const { users } = state();
  await signIn(page, users.owner.email);
  const seeded = await provisionRepository(users.owner.id, false);
  await seeded.admin
    .from("action_candidates")
    .delete()
    .eq("run_id", seeded.runId);
  await seeded.admin.from("analysis_runs").delete().eq("id", seeded.runId);

  await page.goto(`/repos/${seeded.repositoryId}`);
  await expect(
    page.getByText("No analysis yet", { exact: true }),
  ).toBeVisible();
  const runAnalysis = page.getByRole("button", { name: "Run analysis" });
  await expect(runAnalysis).toHaveClass(/bg-blue-600/);
  await runAnalysis.click();

  const pricing = page.getByRole("dialog", {
    name: "Make your website usable by",
  });
  await expect(pricing).toBeVisible();
  await expect(
    pricing.getByRole("button", { name: "Subscribe & run analysis" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Enable tools" })).toHaveCount(
    0,
  );

  const { count, error } = await seeded.admin
    .from("analysis_runs")
    .select("id", { count: "exact", head: true })
    .eq("repository_id", seeded.repositoryId);
  if (error) throw error;
  expect(count).toBe(0);
});

test("legacy unpaid analysis stays readable while new analysis requires payment", async ({
  page,
}) => {
  const { users } = state();
  await signIn(page, users.owner.email);
  const seeded = await provisionRepository(users.owner.id, false);
  await seeded.admin
    .from("analysis_runs")
    .update({
      status: "succeeded",
      stage: "validate",
      stage_statuses: {
        clone: { status: "succeeded" },
        static: { status: "succeeded" },
        synthesize: { status: "succeeded", proposed: 1 },
        validate: { status: "succeeded", total: 1 },
      },
      finished_at: new Date().toISOString(),
    })
    .eq("id", seeded.runId);

  await page.goto(`/repos/${seeded.repositoryId}`);
  await expect(
    page.getByRole("button", { name: "Submit contact" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Install & access" }),
  ).toBeVisible();
  await expect(page.getByText(/Preview mode\. Subscribe/)).toBeVisible();

  // Paywalled controls stay live. Pressing one says why it is blocked and
  // offers the subscription rather than presenting a dead button.
  const pricing = page.getByRole("dialog", {
    name: "Make your website usable by",
  });
  const dismissPricing = async () => {
    await pricing.getByRole("button", { name: "Close pricing" }).click();
    await expect(pricing).toBeHidden();
  };

  const enableToggle = page.getByRole("checkbox", {
    name: "Enable Submit contact",
  });
  await expect(enableToggle).toBeEnabled();
  await enableToggle.click();
  await expect(page.getByText("Subscription required")).toBeVisible();
  await expect(pricing).toBeVisible();
  await dismissPricing();
  await expect(enableToggle).not.toBeChecked();

  await page.getByRole("button", { name: "Copy snippet" }).click();
  await expect(pricing).toBeVisible();
  await dismissPricing();

  await page
    .getByRole("textbox", { name: "Add an origin" })
    .fill("https://staging.example.com");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(pricing).toBeVisible();
  await dismissPricing();

  // The one remaining origin cannot be removed by anyone: a site needs at
  // least one, which is a rule about origins rather than about billing.
  await expect(
    page.getByRole("button", { name: "Remove https://example.com" }),
  ).toBeDisabled();

  await expect(
    page.getByRole("heading", { name: "Agent analytics" }),
  ).toBeVisible();
  const analytics = page.locator("#agent-analytics");
  await expect(
    analytics.getByText("Preview mode", { exact: true }),
  ).toBeVisible();
  await expect(
    analytics.getByText("Waiting for the first agent visit"),
  ).toHaveCount(0);
  await expect(analytics.getByRole("link", { name: "7d" })).toBeVisible();

  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(pricing).toBeVisible();
  await expect(pricing.getByText("$49", { exact: true })).toBeVisible();
  await expect(pricing.getByText("/ month")).toBeVisible();
  await expect(
    pricing.getByRole("button", { name: "Subscribe & run analysis" }),
  ).toBeVisible();
  await expect(
    pricing.getByText("foundative/webmcp-fixture-shop"),
  ).toBeVisible();
  await dismissPricing();

  await page.getByRole("button", { name: "Submit contact" }).click();
  await expect(
    page.getByRole("dialog", { name: "Submit contact" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Source evidence" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await expect(page.getByRole("button", { name: "Enable tools" })).toHaveCount(
    0,
  );
});

test("Stripe Checkout unlocks exactly one repository", async ({ page }) => {
  test.skip(
    process.env.RUN_STRIPE_E2E !== "1",
    "set RUN_STRIPE_E2E=1 for the external Stripe sandbox flow",
  );
  const { users } = state();
  await signIn(page, users.owner.email);
  const seeded = await provisionRepository(users.owner.id, false);
  const { data: liveConnection, error: liveConnectionError } =
    await seeded.admin
      .from("github_connections")
      .select("id")
      .neq("id", seeded.connectionId)
      .limit(1)
      .maybeSingle();
  if (liveConnectionError) throw liveConnectionError;
  test.skip(
    !liveConnection,
    "a real Development GitHub connection is required for paid analysis",
  );
  const { error: connectionUpdateError } = await seeded.admin
    .from("repositories")
    .update({ github_connection_id: liveConnection!.id })
    .eq("id", seeded.repositoryId);
  if (connectionUpdateError) throw connectionUpdateError;
  const env = loadWebEnv();
  const stripe = new Stripe(env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-08-26.dahlia" as Stripe.LatestApiVersion,
  });
  let cleanupCustomerId: string | undefined;

  try {
    const staleCustomer = await stripe.customers.create({
      email: users.owner.email,
      metadata: { repository_id: seeded.repositoryId },
    });
    cleanupCustomerId = staleCustomer.id;
    const staleSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: staleCustomer.id,
      line_items: [{ price: env.STRIPE_REPOSITORY_PRICE_ID!, quantity: 1 }],
      success_url: "https://example.com/success",
      cancel_url: "https://example.com/cancel",
    });
    const { error: staleBillingError } = await seeded.admin
      .from("repository_billing")
      .insert({
        repository_id: seeded.repositoryId,
        org_id: seeded.workspaceId,
        purchased_by: users.owner.id,
        stripe_customer_id: staleCustomer.id,
        stripe_checkout_session_id: staleSession.id,
        stripe_checkout_expires_at: new Date(
          (staleSession.expires_at ?? Math.floor(Date.now() / 1000) + 3600) *
            1000,
        ).toISOString(),
        stripe_price_id: env.STRIPE_REPOSITORY_PRICE_ID!,
        status: "incomplete",
      });
    if (staleBillingError) throw staleBillingError;

    await seeded.admin
      .from("analysis_runs")
      .update({
        status: "succeeded",
        stage: "validate",
        finished_at: new Date().toISOString(),
      })
      .eq("id", seeded.runId);
    await page.goto(`/repos/${seeded.repositoryId}`);
    await page.getByRole("button", { name: "Run analysis" }).click();
    await page
      .getByRole("button", {
        name: "Subscribe & run analysis",
      })
      .click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });

    const { data: checkoutBilling } = await seeded.admin
      .from("repository_billing")
      .select("stripe_checkout_session_id")
      .eq("repository_id", seeded.repositoryId)
      .single();
    expect(checkoutBilling?.stripe_checkout_session_id).toMatch(/^cs_/);
    expect(checkoutBilling?.stripe_checkout_session_id).not.toBe(
      staleSession.id,
    );
    const [expiredSession, currentSession] = await Promise.all([
      stripe.checkout.sessions.retrieve(staleSession.id),
      stripe.checkout.sessions.retrieve(
        checkoutBilling!.stripe_checkout_session_id!,
      ),
    ]);
    expect(expiredSession.status).toBe("expired");
    expect(currentSession.allow_promotion_codes).toBe(true);

    await page.getByLabel("Card number").fill("4242424242424242");
    await page.getByLabel("Expiration").fill("1234");
    await page.getByRole("textbox", { name: "CVC" }).fill("123");
    const name = page.getByLabel("Cardholder name");
    if (await name.isVisible()) await name.fill("Sodium QA");
    const postalCode = page.getByLabel(/ZIP|postal code/i);
    if (await postalCode.isVisible()) await postalCode.fill("10001");
    await page.getByRole("button", { name: /subscribe|pay/i }).click();

    await page.waitForURL(
      new RegExp(`/repos/${seeded.repositoryId}\\?checkout=success`),
      { timeout: 60_000 },
    );
    await expect(page.getByText("Subscription active.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("checkbox", { name: "Enable Submit contact" }),
    ).toBeEnabled();

    const { data: billing } = await seeded.admin
      .from("repository_billing")
      .select("status, stripe_subscription_id, stripe_customer_id")
      .eq("repository_id", seeded.repositoryId)
      .single();
    expect(billing?.status).toBe("active");
    expect(billing?.stripe_subscription_id).toMatch(/^sub_/);

    const latestPaidRun = async () => {
      const { data, error } = await seeded.admin
        .from("analysis_runs")
        .select("id, access_tier, status, repository_commits!inner(sha)")
        .eq("repository_id", seeded.repositoryId)
        .neq("id", seeded.runId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    };
    await expect
      .poll(latestPaidRun, { timeout: 30_000 })
      .toMatchObject({ access_tier: "paid" });
    await expect
      .poll(async () => (await latestPaidRun())?.status, { timeout: 120_000 })
      .toBe("succeeded");

    await page.reload();
    await expect(
      page.getByRole("checkbox", { name: "Enable all tools" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enable tools" }),
    ).toHaveCount(0);
  } finally {
    const { data: billing } = await seeded.admin
      .from("repository_billing")
      .select("stripe_subscription_id, stripe_customer_id")
      .eq("repository_id", seeded.repositoryId)
      .maybeSingle();
    if (billing?.stripe_subscription_id) {
      const subscription = await stripe.subscriptions.retrieve(
        billing.stripe_subscription_id,
      );
      if (subscription.status !== "canceled") {
        await stripe.subscriptions.cancel(billing.stripe_subscription_id, {
          prorate: false,
        });
      }
    }
    const customerId = billing?.stripe_customer_id ?? cleanupCustomerId;
    if (customerId) {
      await stripe.customers.del(customerId);
    }
    await seeded.admin
      .from("stripe_webhook_events")
      .delete()
      .eq("repository_id", seeded.repositoryId);
    await seeded.admin
      .from("repository_billing")
      .delete()
      .eq("repository_id", seeded.repositoryId);
  }
});

test("Settings deletes all account data but no GitHub repository", async ({
  page,
}) => {
  const { users } = state();
  await signIn(page, users.outsider.email);
  const admin = adminClient();
  const { data: membership } = await admin
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", users.outsider.id)
    .single();
  expect(membership).toBeTruthy();

  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(
    page.getByText("GitHub repositories stay untouched."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete everything" }).click();
  await expect(page).toHaveURL(/\/\?deleted=1$/, { timeout: 20_000 });
  await expect(
    page.getByText("Your Sodium account and its data were deleted."),
  ).toBeVisible();

  const { data: deletedUser } = await admin.auth.admin.getUserById(
    users.outsider.id,
  );
  expect(deletedUser.user).toBeNull();
  const { count } = await admin
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .eq("id", membership!.org_id);
  expect(count).toBe(0);
});
