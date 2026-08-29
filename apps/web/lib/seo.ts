import "server-only";
import type { Metadata } from "next";
import { siteUrl } from "./env";
import { publicEnv } from "./public-env";

/**
 * The facts every surface that describes Sodium has to agree on.
 *
 * The page title, the social card, robots.txt, the sitemap, the web manifest
 * and the JSON-LD graph all read from here, so a crawler, a link preview and a
 * structured-data parser can never be told three different things about the
 * same product.
 */

export const SITE_NAME = "Sodium";

/** Under 60 characters, so search results show it whole. */
export const SITE_TITLE = "Sodium - Make your website usable by AI agents";

/** Under 160 characters, so search results show it whole. */
export const SITE_DESCRIPTION =
  "Sodium turns what your website already does into WebMCP tools AI agents can use. Connect a GitHub repository, approve the tools it finds, add one line of code.";

/** The company behind Sodium, named the way the header and footer name it. */
export const PUBLISHER = "Result";

/**
 * Terms a reader would actually search for. Search engines have ignored this
 * tag for years; some answer engines still read it, which is the audience the
 * product is about, so it stays short and honest rather than stuffed.
 */
export const SITE_KEYWORDS = [
  "WebMCP",
  "AI agents",
  "agentic web",
  "browser agents",
  "agent tools",
  "Model Context Protocol",
  "answer engine optimization",
];

/**
 * Only production is a public, stable origin. Development and Preview builds
 * are the same app on throwaway hostnames, and indexing them would compete
 * with production for the same content, so they are kept out of the index
 * from both directions: this drives the robots meta tag and robots.txt.
 */
export function isIndexable(): boolean {
  return publicEnv.NEXT_PUBLIC_SODIUM_ENVIRONMENT === "production";
}

/** A canonical, absolute URL for a path on this deployment's own origin. */
export function absoluteUrl(path = "/"): string {
  return new URL(path, siteUrl()).toString();
}

/**
 * Open Graph fields shared by every page.
 *
 * Next replaces `openGraph` wholesale rather than merging it, so a page that
 * needs to add one field (`url`, say) spreads this instead of restating it.
 * The image is not listed here on purpose: `app/opengraph-image.png` and
 * `app/twitter-image.png` are picked up by file convention, which is also what
 * keeps their URLs absolute and cache-busted.
 */
export const OPEN_GRAPH = {
  type: "website",
  siteName: SITE_NAME,
  locale: "en_US",
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
} as const satisfies Metadata["openGraph"];
