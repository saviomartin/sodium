import type { WorkerEnv } from "../env";
import { log } from "../log";

/**
 * Preview crawling provider. DOM + ARIA snapshots are primary evidence;
 * screenshots secondary. Page text is untrusted data — it is carried in
 * delimited blocks, never treated as instructions.
 */
export interface CrawlTarget {
  baseUrl: string;
  paths: string[];
  authMode: "none" | "cookie" | "basic";
  /** Vault-decrypted credential: "user:pass" (basic) or a Cookie header value. */
  credential: string | null;
}

export interface CrawledPage {
  path: string;
  status: number | null;
  title: string;
  ariaSnapshot: string;
  forms: { selector: string; fields: { name: string; type: string }[] }[];
  dataAttributes: string[];
  screenshot: Uint8Array | null;
  error?: string;
}

export interface CrawlerProvider {
  crawl(target: CrawlTarget): Promise<CrawledPage[]>;
}

const MAX_PAGES = 12;
const PAGE_TIMEOUT_MS = 15_000;

export class PlaywrightCrawler implements CrawlerProvider {
  async crawl(target: CrawlTarget): Promise<CrawledPage[]> {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const pages: CrawledPage[] = [];
    try {
      const context = await browser.newContext({
        httpCredentials:
          target.authMode === "basic" && target.credential
            ? {
                username: target.credential.split(":")[0] ?? "",
                password: target.credential.split(":").slice(1).join(":"),
              }
            : undefined,
        extraHTTPHeaders:
          target.authMode === "cookie" && target.credential
            ? { cookie: target.credential }
            : undefined,
        javaScriptEnabled: true,
        viewport: { width: 1280, height: 900 },
      });
      // The preview is untrusted: block cross-origin requests so a malicious
      // preview cannot use the crawler for SSRF-style probing.
      const origin = new URL(target.baseUrl).origin;
      await context.route("**/*", (route) => {
        const url = route.request().url();
        if (url.startsWith(origin) || url.startsWith("data:"))
          return route.continue();
        return route.abort();
      });

      for (const path of target.paths.slice(0, MAX_PAGES)) {
        const page = await context.newPage();
        try {
          const response = await page.goto(
            new URL(path, target.baseUrl).toString(),
            {
              timeout: PAGE_TIMEOUT_MS,
              waitUntil: "domcontentloaded",
            },
          );
          await page
            .waitForLoadState("networkidle", { timeout: 5000 })
            .catch(() => {});
          const forms = await page.evaluate(() => {
            return [...document.querySelectorAll("form")]
              .slice(0, 10)
              .map((form, index) => ({
                selector: form.id
                  ? `#${form.id}`
                  : `form:nth-of-type(${index + 1})`,
                fields: [...form.querySelectorAll("input,select,textarea")]
                  .map((el) => ({
                    name: el.getAttribute("name") ?? "",
                    type: el.getAttribute("type") ?? el.tagName.toLowerCase(),
                  }))
                  .filter((f) => f.name),
              }));
          });
          const dataAttributes = await page.evaluate(() => {
            const names = new Set<string>();
            for (const el of document.querySelectorAll("*")) {
              for (const attr of el.attributes) {
                if (attr.name.startsWith("data-") && names.size < 100)
                  names.add(attr.name);
              }
            }
            return [...names].sort();
          });
          pages.push({
            path,
            status: response?.status() ?? null,
            title: await page.title(),
            ariaSnapshot: (
              await page
                .locator("body")
                .ariaSnapshot()
                .catch(() => "")
            ).slice(0, 8000),
            forms,
            dataAttributes,
            screenshot: await page
              .screenshot({ type: "png" })
              .then((buffer: Buffer) => new Uint8Array(buffer))
              .catch(() => null),
          });
        } catch (error) {
          pages.push({
            path,
            status: null,
            title: "",
            ariaSnapshot: "",
            forms: [],
            dataAttributes: [],
            screenshot: null,
            error: error instanceof Error ? error.message : "navigation failed",
          });
        } finally {
          await page.close();
        }
      }
      await context.close();
    } finally {
      await browser.close();
    }
    return pages;
  }
}

/** Used when no preview environment is configured: crawling is optional. */
export class NullCrawler implements CrawlerProvider {
  async crawl(): Promise<CrawledPage[]> {
    log("info", "no preview environment configured; skipping crawl");
    return [];
  }
}

export function selectCrawler(
  _env: WorkerEnv,
  hasEnvironment: boolean,
): CrawlerProvider {
  return hasEnvironment ? new PlaywrightCrawler() : new NullCrawler();
}
