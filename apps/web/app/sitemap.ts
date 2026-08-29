import type { MetadataRoute } from "next";
import { absoluteUrl, isIndexable } from "@/lib/seo";

/**
 * Sodium has exactly one public page. The features, pricing and FAQ sections
 * are bands on it rather than routes of their own, and a sitemap lists URLs,
 * so listing them as fragments would be listing the same URL four times.
 *
 * No `lastModified`: it would be the build clock, which changes on every
 * deploy whether or not the page did, and tells a crawler nothing true.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!isIndexable()) return [];

  return [{ url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 }];
}
