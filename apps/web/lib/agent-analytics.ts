export interface AgentAnalyticsSummary {
  agentVisits: number;
  toolCalls: number;
  successfulCalls: number;
  failedCalls: number;
  answerEngineVisits: number;
  manifestFetchFailures: number;
  manifestRejections: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
}

export interface AgentAnalyticsDay {
  date: string;
  agentVisits: number;
  toolCalls: number;
  answerEngineVisits: number;
}

export interface AgentAnalyticsTool {
  tool: string;
  calls: number;
  successfulCalls: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  lastUsedAt: string | null;
}

export interface AnswerEngineTraffic {
  engine: string;
  visits: number;
  lastVisitAt: string | null;
}

export interface AgentAnalytics {
  periodDays: number;
  summary: AgentAnalyticsSummary;
  daily: AgentAnalyticsDay[];
  tools: AgentAnalyticsTool[];
  engines: AnswerEngineTraffic[];
}

const numeric = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function emptyAgentAnalytics(periodDays: number): AgentAnalytics {
  return {
    periodDays,
    summary: {
      agentVisits: 0,
      toolCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      answerEngineVisits: 0,
      manifestFetchFailures: 0,
      manifestRejections: 0,
      averageLatencyMs: 0,
      p95LatencyMs: 0,
    },
    daily: [],
    tools: [],
    engines: [],
  };
}

/** Normalize the JSON returned by the analytics RPC so malformed legacy rows
 * can never break the repository page. */
export function normalizeAgentAnalytics(
  value: unknown,
  fallbackDays: number,
): AgentAnalytics {
  const root = object(value);
  const summary = object(root.summary);
  const daily = Array.isArray(root.daily) ? root.daily : [];
  const tools = Array.isArray(root.tools) ? root.tools : [];
  const engines = Array.isArray(root.engines) ? root.engines : [];

  return {
    periodDays: numeric(root.periodDays) || fallbackDays,
    summary: {
      agentVisits: numeric(summary.agentVisits),
      toolCalls: numeric(summary.toolCalls),
      successfulCalls: numeric(summary.successfulCalls),
      failedCalls: numeric(summary.failedCalls),
      answerEngineVisits: numeric(summary.answerEngineVisits),
      manifestFetchFailures: numeric(summary.manifestFetchFailures),
      manifestRejections: numeric(summary.manifestRejections),
      averageLatencyMs: numeric(summary.averageLatencyMs),
      p95LatencyMs: numeric(summary.p95LatencyMs),
    },
    daily: daily.map((item) => {
      const row = object(item);
      return {
        date: stringOrNull(row.date) ?? "",
        agentVisits: numeric(row.agentVisits),
        toolCalls: numeric(row.toolCalls),
        answerEngineVisits: numeric(row.answerEngineVisits),
      };
    }),
    tools: tools.map((item) => {
      const row = object(item);
      return {
        tool: stringOrNull(row.tool) ?? "unknown",
        calls: numeric(row.calls),
        successfulCalls: numeric(row.successfulCalls),
        averageLatencyMs: numeric(row.averageLatencyMs),
        p95LatencyMs: numeric(row.p95LatencyMs),
        lastUsedAt: stringOrNull(row.lastUsedAt),
      };
    }),
    engines: engines.map((item) => {
      const row = object(item);
      return {
        engine: stringOrNull(row.engine) ?? "Unknown",
        visits: numeric(row.visits),
        lastVisitAt: stringOrNull(row.lastVisitAt),
      };
    }),
  };
}
