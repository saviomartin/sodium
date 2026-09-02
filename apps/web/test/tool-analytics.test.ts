import { describe, expect, it } from "vitest";
import {
  normalizeToolAnalytics,
  summarizeToolAnalytics,
  type ToolEvent,
} from "../lib/tool-analytics";

const event = (
  name: string,
  invocation: string,
  duration: number | null = null,
): ToolEvent => ({
  event: name,
  tool_id: "tl_checkout1",
  tool_name: "start_checkout",
  invocation_id: invocation,
  duration_ms: duration,
  error_code: null,
  received_at: "2026-09-02T08:00:00.000Z",
});

describe("summarizeToolAnalytics", () => {
  it("counts calls, outcomes, denials, and p95 without duplicate events", () => {
    const events = [
      event("tool_started", "11111111-1111-4111-8111-111111111111"),
      event("tool_succeeded", "11111111-1111-4111-8111-111111111111", 80),
      event("tool_succeeded", "11111111-1111-4111-8111-111111111111", 80),
      event("tool_started", "22222222-2222-4222-8222-222222222222"),
      event("tool_failed", "22222222-2222-4222-8222-222222222222", 240),
      event("tool_started", "33333333-3333-4333-8333-333333333333"),
      event("confirmation_denied", "33333333-3333-4333-8333-333333333333", 10),
    ];
    const result = summarizeToolAnalytics(
      events,
      [
        {
          id: "tl_checkout1",
          name: "start_checkout",
          title: "Start checkout",
          risk: "financial",
        },
      ],
      { now: new Date("2026-09-02T12:00:00.000Z") },
    );
    expect(result).toMatchObject({
      calls: 3,
      successes: 1,
      failures: 1,
      denied: 1,
      successRate: 0.5,
      p95Ms: 240,
    });
    expect(result.tools[0]).toMatchObject({
      calls: 3,
      successRate: 0.5,
      p95Ms: 240,
    });
    expect(result.tools[0]?.daily).toEqual([{ date: "2026-09-02", calls: 3 }]);
    expect(result.days.at(-1)).toMatchObject({
      calls: 3,
      successes: 1,
      failures: 1,
      denied: 1,
      p95Ms: 240,
    });
  });

  it("keeps configured tools visible before the first event", () => {
    const result = summarizeToolAnalytics(
      [],
      [{ id: "tl_read0001", name: "read_profile", risk: "read_only" }],
    );
    expect(result.calls).toBe(0);
    expect(result.tools[0]?.name).toBe("read_profile");
    expect(result.tools[0]?.daily).toEqual([]);
  });

  it("orders a tool's lane by the window, not by when events arrived", () => {
    const call = (date: string, invocation: string): ToolEvent => ({
      ...event("tool_started", invocation),
      received_at: `${date}T08:00:00.000Z`,
    });
    const result = summarizeToolAnalytics(
      [
        call("2026-09-02", "22222222-2222-4222-8222-222222222222"),
        call("2026-08-31", "11111111-1111-4111-8111-111111111111"),
        call("2026-09-02", "33333333-3333-4333-8333-333333333333"),
      ],
      [],
      { periodDays: 7, now: new Date("2026-09-02T12:00:00.000Z") },
    );
    expect(result.tools[0]?.daily).toEqual([
      { date: "2026-08-31", calls: 1 },
      { date: "2026-09-02", calls: 2 },
    ]);
  });

  it("builds truthful daily SDK and tool activity for the selected range", () => {
    const now = new Date("2026-09-02T12:00:00.000Z");
    const events: ToolEvent[] = [
      {
        ...event("sdk_ready", ""),
        tool_id: null,
        tool_name: null,
        invocation_id: null,
        received_at: "2026-09-01T08:00:00.000Z",
      },
      event("tool_started", "11111111-1111-4111-8111-111111111111"),
      event("tool_registered", ""),
      event("tool_register_failed", ""),
    ];
    const result = summarizeToolAnalytics(events, [], {
      periodDays: 7,
      now,
    });

    expect(result).toMatchObject({
      periodDays: 7,
      sdkSessions: 1,
      registrations: 1,
      registrationFailures: 1,
    });
    expect(result.days).toHaveLength(7);
    expect(result.days.at(-2)).toMatchObject({
      date: "2026-09-01",
      sdkSessions: 1,
    });
    expect(result.days.at(-1)).toMatchObject({
      date: "2026-09-02",
      calls: 1,
    });
  });
});

describe("normalizeToolAnalytics", () => {
  it("merges database aggregates with deployed tools and referral results", () => {
    const result = normalizeToolAnalytics(
      {
        periodDays: 30,
        calls: 2,
        successes: 1,
        failures: 1,
        denied: 0,
        sdkSessions: 1,
        registrations: 1,
        registrationFailures: 0,
        successRate: 0.5,
        p95Ms: 240,
        lastSeenAt: "2026-09-02T08:00:00.000Z",
        answerEngineVisits: 1,
        days: [],
        tools: [
          {
            id: "tl_checkout1",
            name: "start_checkout",
            calls: 2,
            successes: 1,
            failures: 1,
            denied: 0,
            successRate: 0.5,
            p95Ms: 240,
            daily: [{ date: "2026-09-02", calls: 2 }],
          },
        ],
        engines: [
          {
            name: "ChatGPT",
            visits: 1,
            sessions: 1,
            toolCalls: 2,
            successes: 1,
            referrerVisits: 1,
            campaignVisits: 0,
            lastSeenAt: "2026-09-02T08:00:00.000Z",
          },
        ],
      },
      [
        {
          id: "tl_checkout1",
          name: "start_checkout",
          title: "Start checkout",
          risk: "financial",
        },
        { id: "tl_unused01", name: "read_cart", risk: "read_only" },
      ],
      30,
    );

    expect(result.engines[0]).toMatchObject({
      name: "ChatGPT",
      visits: 1,
      toolCalls: 2,
    });
    expect(result.tools[0]).toMatchObject({
      title: "Start checkout",
      risk: "financial",
      calls: 2,
    });
    expect(result.tools[1]).toMatchObject({
      name: "read_cart",
      calls: 0,
    });
  });
});
