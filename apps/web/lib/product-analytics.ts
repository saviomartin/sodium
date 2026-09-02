"use client";

import { track, type BeforeSendEvent } from "@vercel/analytics";

type AnalyticsProperty = string | number | boolean | null;

/**
 * Every product event this app may send. Adding a name here is the review
 * gate: the list is short on purpose, and an event that would need a project,
 * tool, or user identifier to be useful does not belong on it.
 */
export type ProductAnalyticsEventName =
  | "GitHub Sign In Started"
  | "Google Sign In Started"
  | "CLI Command Copied"
  | "Tool Details Opened";

export interface ProductAnalyticsEvent {
  name: ProductAnalyticsEventName;
  properties?: Record<string, AnalyticsProperty>;
}

/**
 * Product events are deliberately anonymous. Callers may only send small,
 * aggregate dimensions—never user, project, installation, site, or tool
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
  if (segments[1] !== "projects" || !segments[2]) return pathname;

  segments[2] = "[id]";
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
