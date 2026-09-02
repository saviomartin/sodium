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
}

export interface AnalyticsSummary {
  calls: number;
  successes: number;
  failures: number;
  denied: number;
  successRate: number | null;
  p95Ms: number | null;
  lastSeenAt: string | null;
  tools: ToolRollup[];
}

function percentile95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null;
}

export function summarizeToolAnalytics(
  events: ToolEvent[],
  definitions: ToolDefinition[],
): AnalyticsSummary {
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
    });
  }

  const seen = new Set<string>();
  for (const event of events) {
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
    };
    byTool.set(event.tool_id, rollup);
    const eventKey = event.invocation_id
      ? `${event.invocation_id}:${event.event}`
      : `${event.received_at}:${event.tool_id}:${event.event}`;
    if (seen.has(eventKey)) continue;
    seen.add(eventKey);
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
  return {
    calls,
    successes,
    failures,
    denied,
    successRate: completed > 0 ? successes / completed : null,
    p95Ms: percentile95([...durations.values()].flat()),
    lastSeenAt: events[0]?.received_at ?? null,
    tools,
  };
}
