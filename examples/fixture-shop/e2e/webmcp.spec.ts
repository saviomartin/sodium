import { expect, test, type Page } from "@playwright/test";
import { WEBMCP_POLYFILL } from "./polyfill";

/**
 * The end-to-end fixture: proves that approved tools are registered and
 * executed on a sample Next.js site in a WebMCP-capable browser (polyfilled
 * to the current draft surface), through the real signed manifest, real
 * loader bundle and real first-party bridge.
 */

declare global {
  interface Window {
    __wmcp: {
      names(): string[];
      execute(name: string, input?: Record<string, unknown>): Promise<string>;
    };
    __sodium?: { registered(): string[] };
  }
}

test.beforeAll(async ({ request }) => {
  // Restore pristine demo data — a reused dev server keeps state in memory.
  await request.post("/api/reset");
});

test.beforeEach(async ({ context }) => {
  await context.addInitScript(WEBMCP_POLYFILL);
});

async function registeredNames(page: Page): Promise<string[]> {
  await page.waitForFunction(() => window.__sodium !== undefined, undefined, {
    timeout: 10_000,
  });
  return page.evaluate(() => window.__wmcp.names());
}

async function execute(
  page: Page,
  name: string,
  input?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const raw = await page.evaluate(
    ({ toolName, toolInput }) => window.__wmcp.execute(toolName, toolInput),
    { toolName: name, toolInput: input },
  );
  return JSON.parse(raw) as Record<string, unknown>;
}

test("registers route-scoped read-only tools and executes extraction", async ({
  page,
}) => {
  await page.goto("/products");
  const names = await registeredNames(page);
  expect(names).toContain("read_products");
  expect(names).toContain("open_product");
  expect(names).toContain("add_to_cart");
  // Route-gated: contact + orders tools must NOT be live on /products.
  expect(names).not.toContain("submit_contact");
  expect(names).not.toContain("cancel_order");

  const result = await execute(page, "read_products");
  expect(result.ok).toBe(true);
  const data = result.data as {
    names: string[];
    prices: string[];
    cart_size: string;
  };
  expect(data.names).toEqual(["Widget", "Gadget", "Doohickey"]);
  expect(data.prices).toContain("9.99");
});

test("navigate tool performs same-origin navigation", async ({ page }) => {
  await page.goto("/products");
  await registeredNames(page);
  const result = await execute(page, "open_product", { id: "gadget" });
  expect(result.ok).toBe(true);
  await page.waitForURL("**/products/gadget");
  await expect(page.locator("h1")).toHaveText("Gadget");
});

test("form tool fills and submits the contact form through the app's server action", async ({
  page,
}) => {
  await page.goto("/contact");
  const names = await registeredNames(page);
  expect(names).toContain("submit_contact");

  const result = await execute(page, "submit_contact", {
    name: "Ada Lovelace",
    email: "ada@example.com",
    topic: "sales",
    message: "I would like to buy every widget you have.",
  });
  expect(result).toMatchObject({ ok: true, submitted: true });
  await page.waitForURL("**/contact?sent=1");
  await expect(page.locator("[data-contact-sent]")).toBeVisible();
});

test("bridge tool executes the app's own action (reversible add to cart)", async ({
  page,
}) => {
  await page.goto("/products");
  await registeredNames(page);
  const result = await execute(page, "add_to_cart", {
    productId: "widget",
    quantity: 2,
  });
  expect(result.ok).toBe(true);
  expect(result.result).toMatchObject({ added: 2, productId: "widget" });

  // Input validation happens before the handler runs.
  const invalid = await execute(page, "add_to_cart", {
    productId: "widget",
    quantity: 99,
  });
  expect(invalid.ok).toBe(false);
  expect(invalid.error).toBe("invalid_input");
});

test("destructive tool is auth-gated and backend confirmation is enforced", async ({
  page,
}) => {
  // Signed out: /orders redirects to /login and the tool is not registered.
  await page.goto("/orders");
  await page.waitForURL("**/login");

  await page.fill("#login-form input[name=user]", "demo");
  await page.click("#login-form button[type=submit]");
  await page.waitForURL("**/orders");

  const names = await registeredNames(page);
  expect(names).toContain("cancel_order");

  // The customer's backend refuses unconfirmed cancellation regardless of transport.
  const unconfirmed = await execute(page, "cancel_order", {
    orderId: "ord_1001",
    confirm: false,
  });
  expect(unconfirmed.ok).toBe(false);

  const confirmed = await execute(page, "cancel_order", {
    orderId: "ord_1001",
    confirm: true,
  });
  expect(confirmed.ok).toBe(true);
  expect(confirmed.result).toMatchObject({
    orderId: "ord_1001",
    status: "canceled",
  });

  await page.reload();
  await expect(
    page.locator('[data-order-id="ord_1001"] ~ [data-order-status]').first(),
  ).toHaveText("canceled");
});

test("fails closed on a manifest bound to a different origin", async ({
  page,
}) => {
  await page.goto(
    "/products?manifestQuery=" +
      encodeURIComponent("origin=https://evil.example"),
  );
  await page.waitForTimeout(1500);
  const registered = await page.evaluate(() => window.__wmcp.names());
  expect(registered).toEqual([]);
  const sodiumGlobal = await page.evaluate(() => window.__sodium !== undefined);
  expect(sodiumGlobal).toBe(false);
});

test("fails closed on a tampered manifest signature", async ({ page }) => {
  await page.goto("/products?manifestQuery=" + encodeURIComponent("tamper=1"));
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__wmcp.names())).toEqual([]);
});
