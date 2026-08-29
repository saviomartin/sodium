import { describe, expect, it } from "vitest";
import { sanitizeAnalyticsEvent } from "../lib/product-analytics";

describe("sanitizeAnalyticsEvent", () => {
  it("redacts repository and run IDs plus application query state", () => {
    expect(
      sanitizeAnalyticsEvent({
        type: "pageview",
        url: "https://sodium.example/repos/repo-123/runs/run-456?checkout=success&range=7d#agent-analytics",
      }),
    ).toEqual({
      type: "pageview",
      url: "https://sodium.example/repos/[id]/runs/[runId]",
    });
  });

  it("keeps standard campaign parameters", () => {
    expect(
      sanitizeAnalyticsEvent({
        type: "pageview",
        url: "https://sodium.example/?utm_source=github&utm_campaign=launch&installation=123",
      }),
    ).toEqual({
      type: "pageview",
      url: "https://sodium.example/?utm_source=github&utm_campaign=launch",
    });
  });

  it("leaves malformed event URLs unchanged", () => {
    const event = { type: "event" as const, url: "not a url" };
    expect(sanitizeAnalyticsEvent(event)).toBe(event);
  });
});
