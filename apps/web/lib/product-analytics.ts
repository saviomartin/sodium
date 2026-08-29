"use client";

import { track, type BeforeSendEvent } from "@vercel/analytics";

type AnalyticsProperty = string | number | boolean | null;

export interface ProductAnalyticsEvent {
  name:
    | "Allowed Origins Updated"
    | "Analysis Requested"
    | "Billing Management Requested"
    | "Checkout Initiated"
    | "GitHub Connection Started"
    | "GitHub Sign In Started"
    | "Loader Install Copied"
    | "Manifest Published"
    | "Manifest Rolled Back"
    | "Pricing Viewed"
    | "Repository Connection Requested"
    | "Tool Availability Updated";
  properties?: Record<string, AnalyticsProperty>;
}

/**
 * Product events are deliberately anonymous. Callers may only send small,
 * aggregate dimensions—never user, repository, installation, site, or tool
 * identifiers.
 */
export function trackProductEvent(event: ProductAnalyticsEvent): void {
  track(event.name, event.properties);
}

const SAFE_QUERY_PARAMETERS = new Set([
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
]);

function redactDynamicPath(pathname: string): string {
  const segments = pathname.split("/");
  if (segments[1] !== "repos" || !segments[2]) return pathname;

  segments[2] = "[id]";
  if (segments[3] === "runs" && segments[4]) segments[4] = "[runId]";
  return segments.join("/");
}

/** Remove app state and opaque database IDs from automatic page-view URLs. */
export function sanitizeAnalyticsEvent(
  event: BeforeSendEvent,
): BeforeSendEvent {
  try {
    const url = new URL(event.url);
    url.pathname = redactDynamicPath(url.pathname);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (!SAFE_QUERY_PARAMETERS.has(key)) url.searchParams.delete(key);
    }
    return { ...event, url: url.toString() };
  } catch {
    return event;
  }
}
