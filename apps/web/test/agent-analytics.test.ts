import { describe, expect, it } from "vitest";
import {
  emptyAgentAnalytics,
  normalizeAgentAnalytics,
} from "../lib/agent-analytics";

describe("normalizeAgentAnalytics", () => {
  it("normalizes database JSON into the dashboard contract", () => {
    expect(
      normalizeAgentAnalytics(
        {
          periodDays: 7,
          summary: { agentVisits: 4, toolCalls: 3, successfulCalls: 2 },
          daily: [{ date: "2026-08-28", toolCalls: 3 }],
          tools: [{ tool: "cancel_order", calls: 3, p95LatencyMs: 420 }],
          engines: [{ engine: "ChatGPT", visits: 2 }],
        },
        30,
      ),
    ).toMatchObject({
      periodDays: 7,
      summary: { agentVisits: 4, toolCalls: 3, successfulCalls: 2 },
      daily: [{ date: "2026-08-28", toolCalls: 3 }],
      tools: [{ tool: "cancel_order", calls: 3, p95LatencyMs: 420 }],
      engines: [{ engine: "ChatGPT", visits: 2 }],
    });
  });

  it("returns safe zeroes for missing or malformed fields", () => {
    expect(normalizeAgentAnalytics({ summary: "bad" }, 90)).toEqual(
      emptyAgentAnalytics(90),
    );
  });
});
