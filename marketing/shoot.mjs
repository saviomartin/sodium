/**
 * Screenshots a marketing page at an exact size.
 *   node marketing/shoot.mjs one-line.html out/one-line-4x3.png 1200 900
 *
 * Pages are served over http rather than opened as file:// so ES modules and
 * fonts load the same way they do in the app.
 */
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// Playwright lives in the web workspace, not at the repo root.
const require_ = createRequire(resolve(here, "../apps/web/package.json"));
const { chromium } = require_("@playwright/test");

const [
  pagePath = "one-line.html",
  out = "out/one-line-4x3.png",
  w = "1200",
  h = "900",
  dpr = "2",
] = process.argv.slice(2);

const TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
};

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  try {
    const body = await readFile(join(here, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const { port } = server.address();

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(w), height: Number(h) },
  deviceScaleFactor: Number(dpr),
});
page.on("console", (m) => m.type() === "error" && console.error("page:", m.text()));
await page.goto(`http://127.0.0.1:${port}/${pagePath}`);
await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
await page.waitForTimeout(250);
const dest = isAbsolute(out) ? out : resolve(here, out);
await page.screenshot({ path: dest });
await browser.close();
server.close();
console.log(`${dest} — ${Number(w) * Number(dpr)}x${Number(h) * Number(dpr)}`);
