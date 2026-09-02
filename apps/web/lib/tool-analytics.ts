import { z } from "zod";

export interface ToolEvent {
  event: string;
  tool_id: string | null;
  tool_name: string | null;
  invocation_id: string | null;
  duration_ms: number | null;
  error_code: string | null;
  received_at: string;
}

export interface ToolDefinition {
  id: string;
  name: string;
  title?: string;
  risk?: string;
}

export interface ToolDailyCalls {
  date: string;
  calls: number;
}

export interface ToolRollup {
  id: string;
  name: string;
  title: string;
  risk: string;
  calls: number;
  successes: number;
  failures: number;
  denied: number;
  successRate: number | null;
  p95Ms: number | null;
  /**
   * Calls per UTC day, over the same window as `AnalyticsSummary.days`, so a
   * tool's lane in the timeline lines up with the activity chart above it.
   * Only days the tool was actually called appear.
   */
  daily: ToolDailyCalls[];
}

export interface AnalyticsSummary {
  periodDays: number;
  calls: number;
  successes: number;
  failures: number;
  denied: number;
  sdkSessions: number;
  registrations: number;
  registrationFailures: number;
  successRate: number | null;
  p95Ms: number | null;
  lastSeenAt: string | null;
  answerEngineVisits: number;
  engines: EngineReferralRollup[];
  tools: ToolRollup[];
  days: DailyAnalytics[];
}

export interface DailyAnalytics {
  date: string;
  calls: number;
  successes: number;
  failures: number;
  denied: number;
  sdkSessions: number;
  answerEngineVisits: number;
  p95Ms: number | null;
}

export interface EngineReferralRollup {
  name: string;
  visits: number;
  sessions: number;
  toolCalls: number;
  successes: number;
  referrerVisits: number;
  campaignVisits: number;
  lastSeenAt: string;
}

const DailyAnalyticsSchema = z.object({
  date: z.string(),
  calls: z.number().int().nonnegative(),
  successes: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
  denied: z.number().int().nonnegative(),
  sdkSessions: z.number().int().nonnegative(),
  answerEngineVisits: z.number().int().nonnegative(),
  p95Ms: z.number().int().nonnegative().nullable(),
});

const RpcAnalyticsSchema = z.object({
  periodDays: z.number().int().min(7).max(90),
  calls: z.number().int().nonnegative(),
  successes: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
  denied: z.number().int().nonnegative(),
  sdkSessions: z.number().int().nonnegative(),
  registrations: z.number().int().nonnegative(),
  registrationFailures: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1).nullable(),
  p95Ms: z.number().int().nonnegative().nullable(),
  lastSeenAt: z.string().nullable(),
  answerEngineVisits: z.number().int().nonnegative(),
  days: z.array(DailyAnalyticsSchema),
  tools: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      calls: z.number().int().nonnegative(),
      successes: z.number().int().nonnegative(),
      failures: z.number().int().nonnegative(),
      denied: z.number().int().nonnegative(),
      successRate: z.number().min(0).max(1).nullable(),
      p95Ms: z.number().int().nonnegative().nullable(),
      daily: z.array(
        z.object({
          date: z.string(),
          calls: z.number().int().nonnegative(),
        }),
      ),
    }),
  ),
  engines: z.array(
    z.object({
      name: z.string(),
      visits: z.number().int().nonnegative(),
      sessions: z.number().int().nonnegative(),
      toolCalls: z.number().int().nonnegative(),
      successes: z.number().int().nonnegative(),
      referrerVisits: z.number().int().nonnegative(),
      campaignVisits: z.number().int().nonnegative(),
      lastSeenAt: z.string(),
    }),
  ),
});

function emptyTool(tool: ToolDefinition): ToolRollup {
  return {
    id: tool.id,
    name: tool.name,
    title: tool.title ?? tool.name,
    risk: tool.risk ?? "unknown",
    calls: 0,
    successes: 0,
    failures: 0,
    denied: 0,
    successRate: null,
    p95Ms: null,
    daily: [],
  };
}

export function normalizeToolAnalytics(
  value: unknown,
  definitions: ToolDefinition[],
  periodDays: number,
): AnalyticsSummary {
  const parsed = RpcAnalyticsSchema.safeParse(value);
  if (!parsed.success) {
    return summarizeToolAnalytics([], definitions, { periodDays });
  }

  const definitionsById = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );
  const measuredById = new Map(
    parsed.data.tools.map((tool) => [tool.id, tool]),
  );
  const tools = [
    ...definitions.map((definition) => ({
      ...emptyTool(definition),
      ...measuredById.get(definition.id),
    })),
    ...parsed.data.tools
      .filter((tool) => !definitionsById.has(tool.id))
      .map((tool) => ({
        ...tool,
        title: tool.name,
        risk: "unknown",
      })),
  ].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));

  return { ...parsed.data, tools };
}

function percentile95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null;
}

export function summarizeToolAnalytics(
  events: ToolEvent[],
  definitions: ToolDefinition[],
  options: { periodDays?: number; now?: Date } = {},
): AnalyticsSummary {
  const periodDays = options.periodDays ?? 30;
  const now = options.now ?? new Date();
  const byTool = new Map<string, ToolRollup>();
  const durations = new Map<string, number[]>();
  for (const tool of definitions) {
    byTool.set(tool.id, {
      id: tool.id,
      name: tool.name,
      title: tool.title ?? tool.name,
      risk: tool.risk ?? "unknown",
      calls: 0,
      successes: 0,
      failures: 0,
      denied: 0,
      successRate: null,
      p95Ms: null,
      daily: [],
    });
  }

  const seen = new Set<string>();
  const uniqueEvents: ToolEvent[] = [];
  let sdkSessions = 0;
  let registrations = 0;
  let registrationFailures = 0;
  for (const event of events) {
    const eventKey = event.invocation_id
      ? `${event.invocation_id}:${event.event}`
      : `${event.received_at}:${event.tool_id ?? ""}:${event.event}`;
    if (seen.has(eventKey)) continue;
    seen.add(eventKey);
    uniqueEvents.push(event);
    if (event.event === "sdk_ready") sdkSessions++;
    if (event.event === "tool_registered") registrations++;
    if (event.event === "tool_register_failed") registrationFailures++;
    if (!event.tool_id || !event.tool_name) continue;
    const rollup = byTool.get(event.tool_id) ?? {
      id: event.tool_id,
      name: event.tool_name,
      title: event.tool_name,
      risk: "unknown",
      calls: 0,
      successes: 0,
      failures: 0,
      denied: 0,
      successRate: null,
      p95Ms: null,
      daily: [],
    };
    byTool.set(event.tool_id, rollup);
    if (event.event === "tool_started") rollup.calls++;
    if (event.event === "tool_succeeded") rollup.successes++;
    if (event.event === "tool_failed") rollup.failures++;
    if (event.event === "confirmation_denied") rollup.denied++;
    if (
      ["tool_succeeded", "tool_failed", "confirmation_denied"].includes(
        event.event,
      ) &&
      event.duration_ms !== null
    ) {
      const values = durations.get(event.tool_id) ?? [];
      values.push(event.duration_ms);
      durations.set(event.tool_id, values);
    }
  }

  for (const tool of byTool.values()) {
    const completed = tool.successes + tool.failures;
    tool.successRate = completed > 0 ? tool.successes / completed : null;
    tool.p95Ms = percentile95(durations.get(tool.id) ?? []);
  }
  const tools = [...byTool.values()].sort(
    (a, b) => b.calls - a.calls || a.name.localeCompare(b.name),
  );
  const calls = tools.reduce((sum, tool) => sum + tool.calls, 0);
  const successes = tools.reduce((sum, tool) => sum + tool.successes, 0);
  const failures = tools.reduce((sum, tool) => sum + tool.failures, 0);
  const denied = tools.reduce((sum, tool) => sum + tool.denied, 0);
  const completed = successes + failures;
  const dayMap = new Map<string, DailyAnalytics>();
  for (let offset = periodDays - 1; offset >= 0; offset--) {
    const value = new Date(now);
    value.setUTCHours(0, 0, 0, 0);
    value.setUTCDate(value.getUTCDate() - offset);
    const date = value.toISOString().slice(0, 10);
    dayMap.set(date, {
      date,
      calls: 0,
      successes: 0,
      failures: 0,
      denied: 0,
      sdkSessions: 0,
      answerEngineVisits: 0,
      p95Ms: null,
    });
  }
  const dailyDurations = new Map<string, number[]>();
  /** Calls per tool per day, keyed `<tool id>` then `<date>`. */
  const callsByToolDate = new Map<string, Map<string, number>>();
  for (const event of uniqueEvents) {
    const date = event.received_at.slice(0, 10);
    const day = dayMap.get(date);
    if (!day) continue;
    if (event.event === "tool_started") {
      day.calls++;
      if (event.tool_id) {
        const lane = callsByToolDate.get(event.tool_id) ?? new Map();
        lane.set(date, (lane.get(date) ?? 0) + 1);
        callsByToolDate.set(event.tool_id, lane);
      }
    }
    if (event.event === "tool_succeeded") day.successes++;
    if (event.event === "tool_failed") day.failures++;
    if (event.event === "confirmation_denied") day.denied++;
    if (event.event === "sdk_ready") day.sdkSessions++;
    if (
      ["tool_succeeded", "tool_failed", "confirmation_denied"].includes(
        event.event,
      ) &&
      event.duration_ms !== null
    ) {
      const values = dailyDurations.get(date) ?? [];
      values.push(event.duration_ms);
      dailyDurations.set(date, values);
    }
  }
  for (const [date, values] of dailyDurations) {
    const day = dayMap.get(date);
    if (day) day.p95Ms = percentile95(values);
  }
  // Lanes are ordered by the window rather than by insertion, so a tool called
  // out of order still reads left to right against the chart above it.
  const dates = [...dayMap.keys()];
  for (const tool of tools) {
    const lane = callsByToolDate.get(tool.id);
    if (!lane) continue;
    tool.daily = dates
      .filter((date) => lane.has(date))
      .map((date) => ({ date, calls: lane.get(date)! }));
  }
  return {
    periodDays,
    calls,
    successes,
    failures,
    denied,
    sdkSessions,
    registrations,
    registrationFailures,
    successRate: completed > 0 ? successes / completed : null,
    p95Ms: percentile95([...durations.values()].flat()),
    lastSeenAt: events[0]?.received_at ?? null,
    answerEngineVisits: 0,
    engines: [],
    tools,
    days: [...dayMap.values()],
  };
}
