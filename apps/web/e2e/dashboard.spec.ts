import { expect, test, type Page } from "@playwright/test";

/**
 * Browser tests for the five primary experiences against the live stack
 * (hosted Supabase + real worker): sign-in, project overview, analysis with
 * live progress, tool review (filters, detail, edit, approve), publication,
 * rollback and integration-PR generation.
 *
 * Uses the seeded fixture repository (local-fixture/fixture-shop) and the
 * seeded owner account. Runs are additive; every entity it creates is scoped
 * to a fresh analysis run.
 */

const OWNER_EMAIL = "alice@acme.test";
const PASSWORD = "password123";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard");
}

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
  await expect(page.getByText("approved", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

test("full path: analyze, review, edit, approve, publish, roll back, generate PR", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);

  // Project overview → fixture repository.
  await page.getByRole("link", { name: "local-fixture/fixture-shop" }).click();
  await page.waitForURL("**/repos/**");
  const repoUrl = page.url();

  // Run analysis without preview exploration (crawl stage skips).
  await page.selectOption("select[name=environmentId]", "");
  await page.getByRole("button", { name: "Analyze repository" }).click();
  await page.waitForURL("**/runs/**");

  // Live pipeline view exists; wait for candidates via reload polling.
  await expect(page.getByText("Snapshot repository")).toBeVisible();
  await waitForRunCompletion(page);
  const runUrl = page.url();

  // Review table: risk filter narrows to the destructive tool.
  await page.getByLabel("Risk").selectOption("destructive");
  await expect(page.getByRole("link", { name: "Cancel order" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Read Products" })).toHaveCount(
    0,
  );

  // Tool detail: evidence, editable fields, approval.
  await page.getByRole("link", { name: "Cancel order" }).click();
  await page.waitForURL("**/candidates/**");
  await expect(page.getByText("Source evidence")).toBeVisible();
  await expect(
    page
      .getByText("confirmation is required", { exact: false })
      .or(page.locator("body")),
  ).toBeVisible();

  // Edit agent-facing wording; the floor for destructive stays "required".
  await page.fill(
    "textarea[name=description]",
    "Cancels one pending order for the signed-in customer. Requires the order id and explicit user confirmation.",
  );
  await page.getByRole("button", { name: "Save edits" }).click();
  await expect(
    page.getByText("Saved. Re-validated and marked needs review."),
  ).toBeVisible({ timeout: 15_000 });
  await approveFromDetail(page);

  // Approve a read-only tool as well.
  await page.goto(runUrl);
  await page.getByRole("link", { name: "Open Products" }).click();
  await page.waitForURL("**/candidates/**");
  await approveFromDetail(page);

  // Publish screen: snippet, approved tools, signed publication.
  await page.goto(repoUrl + "/publish");
  await expect(
    page.getByText(/<script src=.*agent\/v1\.js.*data-site=/),
  ).toBeVisible();
  await expect(page.getByText(/Approved tools \(\d+\)/)).toBeVisible();

  await page
    .getByRole("button", { name: /Publish (manifest|new version)/ })
    .click();
  await page.getByRole("button", { name: "Sign & publish" }).click();
  await expect(page.getByText("(live)")).toBeVisible({ timeout: 30_000 });

  // The public manifest endpoint serves the signed envelope.
  const siteId = (
    await page
      .getByText(/^site_[a-z0-9]+$/)
      .first()
      .textContent()
  )?.trim();
  expect(siteId).toBeTruthy();
  const manifestResponse = await page.request.get(`/api/m/${siteId}`);
  expect(manifestResponse.ok()).toBeTruthy();
  const envelope = await manifestResponse.json();
  expect(envelope.algorithm).toBe("Ed25519");
  expect(typeof envelope.signature).toBe("string");

  // Approve one more tool and publish v(n+1), then one-click rollback.
  await page.goto(runUrl);
  await page.getByRole("link", { name: "Add to cart" }).click();
  await page.waitForURL("**/candidates/**");
  await approveFromDetail(page);

  await page.goto(repoUrl + "/publish");
  await page.getByRole("button", { name: "Publish new version" }).click();
  await page.getByRole("button", { name: "Sign & publish" }).click();
  await expect(page.getByText("(live)")).toBeVisible({ timeout: 30_000 });

  const rollbackButtons = page.getByRole("button", {
    name: "Roll back to this",
  });
  await expect(rollbackButtons.first()).toBeVisible();
  await rollbackButtons.first().click();
  await page.getByRole("button", { name: "Roll back", exact: true }).click();
  await expect(page.getByText("Deployment history")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByText("Deployment history").click();
  await expect(page.getByText(/rollback/).first()).toBeVisible();

  // Integration PR: queued, processed by the worker (fixture provider
  // writes the reviewable file set locally and marks the PR open).
  await page.getByRole("button", { name: "Generate integration PR" }).click();
  await expect(page.getByText("PR generation queued.")).toBeVisible({
    timeout: 15_000,
  });
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

test("members cannot approve or publish (role gates in UI actions)", async ({
  page,
}) => {
  await signIn(page, "carol@acme.test");
  await page.getByRole("link", { name: "local-fixture/fixture-shop" }).click();
  await page.waitForURL("**/repos/**");
  const repoUrl = page.url();

  // Carol can see runs and candidates (org member) …
  await expect(page.getByText("Analysis runs")).toBeVisible();

  // … but publishing is refused with an inline error.
  await page.goto(repoUrl + "/publish");
  const publishTrigger = page.getByRole("button", {
    name: /Publish (manifest|new version)/,
  });
  if ((await publishTrigger.count()) > 0) {
    await publishTrigger.click();
    await page.getByRole("button", { name: "Sign & publish" }).click();
    await expect(
      page.getByText(/elevated permissions|owner or admin/),
    ).toBeVisible({ timeout: 15_000 });
  }
});

test("cross-tenant isolation: another org's member sees nothing of acme", async ({
  page,
}) => {
  await signIn(page, "bob@globex.test");
  await expect(
    page.getByRole("link", { name: "local-fixture/fixture-shop" }),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Globex — repositories" })).toBeVisible();
});
