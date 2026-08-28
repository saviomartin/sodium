import { expect, test } from "@playwright/test";
import type { ActionContract } from "@sodium/contracts";
import { adminClient, readState, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

const state = () => readState();

const cancelOrder: ActionContract = {
  contractVersion: 1,
  actionId: "act_0123456789abcdef",
  name: "cancel_order",
  title: "Cancel order",
  description:
    "Cancels a pending order after the signed-in customer confirms the action.",
  inputSchema: {
    type: "object",
    properties: {
      orderId: { type: "string" },
      confirm: { type: "boolean" },
    },
    required: ["orderId", "confirm"],
    additionalProperties: false,
  },
  output: { description: "The canceled order id and status." },
  evidence: [
    {
      kind: "source",
      primitive: "server_action",
      filePath: "app/actions.ts",
      startLine: 40,
      endLine: 70,
      snippetSha256: "a".repeat(64),
      excerpt: "export async function cancelOrder(input)",
      summary: "Server action validates and cancels one pending order.",
    },
  ],
  routes: [{ pathPattern: "/orders", requiresSelector: "[data-signed-in]" }],
  auth: { required: true, roles: [] },
  riskLevel: "destructive",
  confirmation: "required",
  handler: { kind: "bridge", bridgeKey: "actions.cancel_order" },
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
    .select("id")
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
      action_id: cancelOrder.actionId,
      name: cancelOrder.name,
      title: cancelOrder.title,
      description: cancelOrder.description,
      contract: cancelOrder,
      risk_level: cancelOrder.riskLevel,
      confirmation: cancelOrder.confirmation,
      confidence: cancelOrder.confidence,
      status: "needs_review",
    })
    .select("id")
    .single();
  if (candidateError || !candidate) throw candidateError;

  return {
    admin,
    workspaceId: membership.org_id,
    repositoryId: repository.id,
    runId: run.id,
    candidateId: candidate.id,
  };
}

test("analysis returns to the repo and tool toggles publish immediately", async ({
  page,
}) => {
  const { users } = state();
  await signIn(page, users.owner.email);

  await expect(page).toHaveURL(/\/connect$/);
  await expect(
    page.getByRole("heading", { name: "Connect a GitHub repository" }),
  ).toBeVisible();
  await expect(page.getByText(/create.*organization/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();

  const seeded = await provisionRepository(users.owner.id);
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
        crawl: { status: "skipped", message: "No preview configured" },
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
  await expect(page.getByRole("link", { name: "Cancel order" })).toBeVisible();

  const enableToggle = page.getByRole("checkbox", {
    name: "Enable Cancel order",
  });
  await enableToggle.check();
  await expect(
    page.getByRole("checkbox", { name: "Disable Cancel order" }),
  ).toBeChecked({ timeout: 15_000 });
  await expect
    .poll(async () => {
      const { data: liveSite } = await seeded.admin
        .from("sites")
        .select("current_manifest_id")
        .eq("repository_id", seeded.repositoryId)
        .single();
      return liveSite?.current_manifest_id ?? null;
    })
    .not.toBeNull();

  await page.getByRole("link", { name: "Cancel order" }).click();
  await expect(page.getByText("available", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /approve|publish|reject/i })).toHaveCount(
    0,
  );

  await page.goto(`/repos/${seeded.repositoryId}`);
  const disableToggle = page.getByRole("checkbox", {
    name: "Disable Cancel order",
  });
  await disableToggle.uncheck();
  await expect(
    page.getByRole("checkbox", { name: "Enable Cancel order" }),
  ).not.toBeChecked({ timeout: 15_000 });

  const removedPublishPage = await page.goto(
    `/repos/${seeded.repositoryId}/publish`,
  );
  expect(removedPublishPage?.status()).toBe(404);

  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
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
  await expect(page).toHaveURL(/\/login\?deleted=1$/, { timeout: 20_000 });

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
