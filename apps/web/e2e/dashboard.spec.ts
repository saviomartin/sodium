import { expect, test } from "@playwright/test";
import type { ActionContract } from "@sodium/contracts";
import { adminClient, readState, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

const state = () => readState();

const submitContact: ActionContract = {
  contractVersion: 1,
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
  output: { description: "Contact form submission acknowledgement." },
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

async function provisionRepository(userId: string) {
  const admin = adminClient();
  const { data: membership, error: membershipError } = await admin
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .single();
  if (membershipError || !membership) throw membershipError;

  const unique = Number(String(Date.now()).slice(-11));
  const { data: installation, error: installationError } = await admin
    .from("github_installations")
    .insert({
      org_id: membership.org_id,
      installation_id: unique,
      account_login: "foundative",
      account_type: "Organization",
      created_by: userId,
    })
    .select("id")
    .single();
  if (installationError || !installation) throw installationError;

  const { data: repository, error: repositoryError } = await admin
    .from("repositories")
    .insert({
      org_id: membership.org_id,
      installation_id: installation.id,
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
    githubInstallationId: unique,
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
    page.getByRole("heading", { name: "No GitHub repository connected" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect a GitHub repo" }),
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
  await expect(page.getByRole("button", { name: "Add account" })).toBeVisible();
  await expect(page.locator('input[name="intent"]')).toHaveValue("add");
  await expect(
    page.getByRole("link", { name: /Update access/ }),
  ).toHaveAttribute(
    "href",
    `https://github.com/organizations/foundative/settings/installations/${seeded.githubInstallationId}`,
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
    page.getByRole("link", { name: "Submit contact" }),
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
  await expect(page.getByRole("link", { name: /\/api\/m\// })).toHaveAttribute(
    "href",
    `http://localhost:3100/api/m/${seeded.sitePublicId}`,
  );

  const enableToggle = page.getByRole("checkbox", {
    name: "Enable Submit contact",
  });
  await enableToggle.check();
  await expect(
    page.getByRole("checkbox", { name: "Disable Submit contact" }),
  ).toBeChecked({ timeout: 15_000 });
  await expect(
    page.getByText("Unpublished tool or origin changes are ready."),
  ).toBeVisible();
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
  await expect(agentAnalytics.getByText("ChatGPT")).toBeVisible();
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

  await page.getByRole("button", { name: "Generate integration PR" }).click();
  await expect(page.getByText(/PR generation (is )?queued/)).toBeVisible({
    timeout: 15_000,
  });
  const { data: integrationPr } = await seeded.admin
    .from("integration_prs")
    .select("id, status")
    .eq("site_id", seeded.siteId)
    .single();
  expect(integrationPr?.status).toBe("pending");
  const prUrl = "https://github.com/foundative/webmcp-fixture-shop/pull/123";
  await seeded.admin
    .from("integration_prs")
    .update({
      status: "open",
      branch: "sodium/integration-e2e",
      pr_number: 123,
      url: prUrl,
    })
    .eq("id", integrationPr!.id);
  // The repository page reconciles background PR status without a reload.
  await expect(page.getByRole("link", { name: "Open #123 ↗" })).toHaveAttribute(
    "href",
    prUrl,
    { timeout: 10_000 },
  );

  await page.getByRole("link", { name: "Submit contact" }).click();
  await expect(page.getByText("available", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /approve|publish|reject/i }),
  ).toHaveCount(0);

  await page.goto(`/repos/${seeded.repositoryId}`);
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
    .poll(async () => {
      const response = await page.request.get(`/api/m/${seeded.sitePublicId}`);
      const currentEnvelope = (await response.json()) as { payload: string };
      const currentManifest = JSON.parse(
        Buffer.from(currentEnvelope.payload, "base64url").toString("utf8"),
      ) as { tools: unknown[] };
      return currentManifest.tools.length;
    })
    .toBe(0);

  const removedPublishPage = await page.goto(
    `/repos/${seeded.repositoryId}/publish`,
  );
  expect(removedPublishPage?.status()).toBe(404);

  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("button", { name: "Continue with GitHub" }),
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
    page.getByRole("button", { name: "Run analysis now" }),
  ).toBeVisible();
  await expect(
    page.getByText("No executable tools found", { exact: true }),
  ).toHaveCount(0);
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
