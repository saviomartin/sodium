import type { MetadataRoute } from "next";
import { absoluteUrl, isIndexable } from "@/lib/seo";

/**
 * Private account and transport routes that never belong in search results.
 */
const PRIVATE = [
  "/activate",
  "/api/",
  "/auth/",
  "/dashboard",
  "/login",
  "/projects/",
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
