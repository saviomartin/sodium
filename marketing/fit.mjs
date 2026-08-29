/** Reports the rendered height of a shot's content at a given viewport width. */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(resolve(here, "../apps/web/package.json"));
const { chromium } = require_("@playwright/test");

const browser = await chromium.launch();
for (const shot of ["overview", "tools", "engines"]) {
  for (const width of [1000, 1100, 1200, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(
      `http://localhost:3000/auth/analytics-preview-tmp?shot=${shot}`,
      { waitUntil: "networkidle" },
    );
    await page.waitForTimeout(500);
    const height = await page.evaluate(
      () => document.querySelector("main").getBoundingClientRect().height,
    );
    // Viewport height that leaves ~6% breathing room top and bottom.
    const ideal = Math.round(height / 0.88);
    console.log(
      `${shot} @${width}: content ${Math.round(height)} → 16:9 needs ${Math.round((width * 9) / 16)}, ideal viewport height ${ideal}, ideal width ${Math.round((ideal * 16) / 9)}`,
    );
    await page.close();
  }
}
await browser.close();
