import { describe, expect, it } from "vitest";
import {
  dailyRange,
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
          tools: [
            {
              tool: "cancel_order",
              calls: 3,
              p95LatencyMs: 420,
              daily: [{ date: "2026-08-28", calls: 3 }],
            },
          ],
          engines: [{ engine: "ChatGPT", visits: 2 }],
        },
        30,
      ),
    ).toMatchObject({
      periodDays: 7,
      summary: { agentVisits: 4, toolCalls: 3, successfulCalls: 2 },
      daily: [{ date: "2026-08-28", toolCalls: 3 }],
      tools: [
        {
          tool: "cancel_order",
          calls: 3,
          p95LatencyMs: 420,
          daily: [{ date: "2026-08-28", calls: 3 }],
        },
      ],
      engines: [{ engine: "ChatGPT", visits: 2 }],
    });
  });

  it("defaults a day's success and latency when the RPC predates them", () => {
    const [day] = normalizeAgentAnalytics(
      { daily: [{ date: "2026-08-28", toolCalls: 3 }] },
      30,
    ).daily;
    expect(day).toEqual({
      date: "2026-08-28",
      agentVisits: 0,
      toolCalls: 3,
      successfulCalls: 0,
      p95LatencyMs: 0,
      answerEngineVisits: 0,
    });
  });

  it("defaults a tool's day buckets when the RPC predates them", () => {
    const [tool] = normalizeAgentAnalytics(
      { tools: [{ tool: "cancel_order", calls: 3 }] },
      30,
    ).tools;
    expect(tool?.daily).toEqual([]);
  });

  it("returns safe zeroes for missing or malformed fields", () => {
    expect(normalizeAgentAnalytics({ summary: "bad" }, 90)).toEqual(
      emptyAgentAnalytics(90),
    );
  });
});

describe("dailyRange", () => {
  it("passes recorded days through untouched", () => {
    const analytics = {
      ...emptyAgentAnalytics(7),
      daily: [
        {
          date: "2026-08-28",
          agentVisits: 1,
          toolCalls: 2,
          successfulCalls: 2,
          p95LatencyMs: 310,
          answerEngineVisits: 0,
        },
      ],
    };
    expect(dailyRange(analytics)).toBe(analytics.daily);
  });

  it("synthesizes a contiguous zeroed axis when nothing was recorded", () => {
    const days = dailyRange(emptyAgentAnalytics(7));
    expect(days).toHaveLength(7);
    expect(days.every((day) => day.toolCalls === 0)).toBe(true);
    expect(new Set(days.map((day) => day.date)).size).toBe(7);
    const spans = days.map((day) => Date.parse(`${day.date}T00:00:00Z`));
    for (let index = 1; index < spans.length; index += 1) {
      expect(spans[index]! - spans[index - 1]!).toBe(86_400_000);
    }
  });
});
