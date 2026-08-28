import { expect, test, type Page } from "@playwright/test";
import { adminClient, readState, signIn } from "./helpers";

/**
 * Browser tests for the five primary experiences against the live stack
 * (hosted Supabase + real worker): onboarding from a completely empty
 * account, analysis with live progress, tool review (filters, detail, edit,
 * approve), publication, rollback, integration-PR generation, member role
 * gates and cross-tenant isolation.
 *
 * No seeded accounts exist: global-setup creates three ephemeral users via
 * the auth admin API and this suite signs them in with admin-issued
 * magic-link tokens through the app's own /auth/confirm route — the same
 * cookie machinery real sign-ins use. Teardown deletes everything.
 */

test.describe.configure({ mode: "serial" });

const state = () => readState();
let repoUrl = "";
let runUrl = "";
let orgSlug = "";

/** Reload-based wait: works whether or not realtime broadcast connects. */
async function waitForRunCompletion(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        await page.reload();
        const rows = await page.locator("table tbody tr").count();
        const failed = await page.getByText(/failed/i).count();
        return rows > 1 ? "done" : failed > 0 ? "failed" : "pending";
      },
      { timeout: 240_000, intervals: [5_000] },
    )
    .toBe("done");
}

async function approveFromDetail(page: Page) {
  await page.getByRole("button", { name: "Approve for publication" }).click();
  await expect(page.getByText("approved", { exact: true })).toBeVisible({ timeout: 15_000 });
}

test("owner: onboarding → analyze → review → publish → roll back → PR", async ({ page }) => {
  const { users, stamp } = state();
  await signIn(page, users.owner.email);

  // Empty account: the dashboard offers exactly one next action.
  await expect(page.getByText("Create your organization")).toBeVisible();
  await page.getByRole("link", { name: "Start onboarding" }).click();
  await page.waitForURL("**/onboarding");

  // Step 1: create the organization.
  orgSlug = `e2e-${stamp}`;
  await page.fill("input[name=name]", "E2E Sodium");
  await page.fill("input[name=slug]", orgSlug);
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.waitForURL("**/dashboard**");

  // Step 2: connect the local fixture repository (no GitHub App configured).
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Use the local fixture repository" }).click();
  await page.waitForURL("**/repos/**");
  repoUrl = page.url();

  // Run analysis. No preview environment exists, so the crawl stage skips.
  await page.getByRole("button", { name: "Analyze repository" }).click();
  await page.waitForURL("**/runs/**");
  await expect(page.getByText("Snapshot repository")).toBeVisible();
  await waitForRunCompletion(page);
  runUrl = page.url();

  // Review table: risk filter narrows to the destructive tool.
  await page.getByLabel("Risk").selectOption("destructive");
  await expect(page.getByRole("link", { name: "Cancel order" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Products" })).toHaveCount(0);

  // Tool detail: evidence, editable fields, approval.
  await page.getByRole("link", { name: "Cancel order" }).click();
  await page.waitForURL("**/candidates/**");
  await expect(page.getByText("Source evidence")).toBeVisible();
  await page.fill(
    "textarea[name=description]",
    "Cancels one pending order for the signed-in customer. Requires the order id and explicit user confirmation.",
  );
  await page.getByRole("button", { name: "Save edits" }).click();
  await expect(page.getByText("Saved. Re-validated and marked needs review.")).toBeVisible({
    timeout: 15_000,
  });
  await approveFromDetail(page);

  // Approve a second tool.
  await page.goto(runUrl);
  await page.getByRole("link", { name: "Add to cart" }).click();
  await page.waitForURL("**/candidates/**");
  await approveFromDetail(page);

  // Publish screen: snippet, approved tools, signed publication.
  await page.goto(repoUrl + "/publish");
  await expect(page.getByText(/<script src=.*agent\/v1\.js.*data-site=/)).toBeVisible();
  await expect(page.getByText(/Approved tools \(\d+\)/)).toBeVisible();
  await page.getByRole("button", { name: /Publish (manifest|new version)/ }).click();
  await page.getByRole("button", { name: "Sign & publish" }).click();
  await expect(page.getByText("(live)")).toBeVisible({ timeout: 30_000 });

  // The public manifest endpoint serves the signed envelope.
  const siteId = (await page.getByText(/^site_[a-z0-9]+$/).first().textContent())?.trim();
  expect(siteId).toBeTruthy();
  const manifestResponse = await page.request.get(`/api/m/${siteId}`);
  expect(manifestResponse.ok()).toBeTruthy();
  const envelope = await manifestResponse.json();
  expect(envelope.algorithm).toBe("Ed25519");
  expect(typeof envelope.signature).toBe("string");

  // Publish v2 and roll back to v1.
  await page.goto(runUrl);
  await page.getByRole("link", { name: "Open Products" }).click();
  await page.waitForURL("**/candidates/**");
  await approveFromDetail(page);

  await page.goto(repoUrl + "/publish");
  await page.getByRole("button", { name: "Publish new version" }).click();
  await page.getByRole("button", { name: "Sign & publish" }).click();
  await expect(page.getByText("(live)")).toBeVisible({ timeout: 30_000 });

  const rollbackButtons = page.getByRole("button", { name: "Roll back to this" });
  await expect(rollbackButtons.first()).toBeVisible();
  await rollbackButtons.first().click();
  await page.getByRole("button", { name: "Roll back", exact: true }).click();
  await expect(page.getByText("Deployment history")).toBeVisible({ timeout: 30_000 });
  await page.getByText("Deployment history").click();
  await expect(page.getByText(/rollback/).first()).toBeVisible();

  // Integration PR: queued, then processed by the worker.
  await page.getByRole("button", { name: "Generate integration PR" }).click();
  await expect(page.getByText("PR generation queued.")).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByText("sodium/integration-", { exact: false }).count();
      },
      { timeout: 120_000, intervals: [5_000] },
    )
    .toBeGreaterThan(0);
});

test("member can view but not approve or publish", async ({ page }) => {
  const { users } = state();

  // Add the member to the owner's org via the service client (there is no
  // invite UI in v1; membership management is owner/service concern).
  const admin = adminClient();
  const { data: org } = await admin.from("organizations").select("id").eq("slug", orgSlug).single();
  await admin
    .from("org_memberships")
    .upsert({ org_id: org!.id, user_id: users.member.id, role: "member" });

  await signIn(page, users.member.email);
  await page.getByRole("link", { name: "local-fixture/fixture-shop" }).click();
  await page.waitForURL("**/repos/**");
  await expect(page.getByText("Analysis runs")).toBeVisible();

  await page.goto(page.url() + "/publish");
  const publishTrigger = page.getByRole("button", { name: /Publish (manifest|new version)/ });
  await expect(publishTrigger).toBeVisible();
  await publishTrigger.click();
  await page.getByRole("button", { name: "Sign & publish" }).click();
  await expect(page.getByText(/elevated permissions|owner or admin/)).toBeVisible({
    timeout: 15_000,
  });
});

test("cross-tenant isolation: an outsider sees nothing", async ({ page }) => {
  const { users } = state();
  await signIn(page, users.outsider.email);
  await expect(page.getByText("Create your organization")).toBeVisible();
  await expect(page.getByRole("link", { name: "local-fixture/fixture-shop" })).toHaveCount(0);

  const response = await page.goto(repoUrl);
  expect(response?.status()).toBe(404);
});
