"use client";

import { Analytics } from "@vercel/analytics/next";
import { sanitizeAnalyticsEvent } from "@/lib/product-analytics";

export function WebAnalytics() {
  return <Analytics beforeSend={sanitizeAnalyticsEvent} />;
}
