import type { MetadataRoute } from "next";
import { absoluteUrl, isIndexable } from "@/lib/seo";

/**
 * Paths that exist for a signed-in session, never for a search result.
 *
 * The loader (`/agent/...`) and the manifest endpoint (`/api/m/...`) are
 * deliberately absent: a customer's page fetches both while it renders, and a
 * crawler that is blocked from a page's own resources renders that page
 * wrong. Blocking them here would damage our customers' search results, not
 * protect ours.
 */
const PRIVATE = [
  "/api/internal/",
  "/api/webhooks/",
  "/auth/",
  "/billing/",
  "/connect",
  "/dashboard",
  "/login",
  "/repos/",
  "/settings",
];

export default function robots(): MetadataRoute.Robots {
  // Development and Preview are the same app on throwaway hostnames. Nothing
  // there should ever compete with production for the same content.
  if (!isIndexable()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
