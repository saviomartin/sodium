/**
 * Screenshots a route from the running dev server.
 *   node marketing/shoot-app.mjs /auth/analytics-preview-tmp out/x.png 1600 900 2 [clipHeight]
 * Omit clipHeight for a full-page shot.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(resolve(here, "../apps/web/package.json"));
const { chromium } = require_("@playwright/test");

const [
  route = "/",
  out = "out/app.png",
  w = "1600",
  h = "900",
  dpr = "2",
  clipHeight,
  base = "http://127.0.0.1:3000",
] = process.argv.slice(2);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(w), height: Number(h) },
  deviceScaleFactor: Number(dpr),
});
await page.goto(base + route, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
const dest = isAbsolute(out) ? out : resolve(here, out);
await page.screenshot(
  clipHeight
    ? { path: dest, clip: { x: 0, y: 0, width: Number(w), height: Number(clipHeight) } }
    : { path: dest, fullPage: true },
);
await browser.close();
console.log(dest);
