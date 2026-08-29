import Link from "next/link";
import type { AgentAnalytics } from "@/lib/agent-analytics";

const number = new Intl.NumberFormat("en-US");

function formatLatency(value: number): string {
  if (!value) return "—";
  if (value < 1_000) return `${number.format(value)} ms`;
  return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)} s`;
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function RangePicker({ repoId, days }: { repoId: string; days: number }) {
  return (
    <nav
      aria-label="Analytics date range"
      className="flex rounded-md border border-neutral-200 bg-neutral-50 p-0.5"
    >
      {[7, 30, 90].map((range) => (
        <Link
          key={range}
          href={`/repos/${repoId}?range=${range}d#agent-analytics`}
          aria-current={range === days ? "page" : undefined}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            range === days
              ? "bg-white text-neutral-950 shadow-sm"
              : "text-neutral-500 hover:text-neutral-950"
          }`}
        >
          {range}d
        </Link>
      ))}
    </nav>
  );
}

function ActivityChart({ analytics }: { analytics: AgentAnalytics }) {
  const max = Math.max(
    1,
    ...analytics.daily.flatMap((day) => [day.toolCalls, day.agentVisits]),
  );
  const labelEvery =
    analytics.periodDays > 30 ? 15 : analytics.periodDays > 7 ? 7 : 1;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-950">
            Agent activity
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Compatible-agent visits and completed tool calls, by UTC day.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-blue-600" /> Tool calls
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-neutral-300" /> Agent visits
          </span>
        </div>
      </div>
      <div className="flex h-44 items-end gap-px border-b border-neutral-200 pt-4">
        {analytics.daily.map((day, index) => {
          const toolHeight = day.toolCalls
            ? Math.max(3, (day.toolCalls / max) * 100)
            : 0;
          const visitHeight = day.agentVisits
            ? Math.max(3, (day.agentVisits / max) * 100)
            : 0;
          return (
            <div
              key={day.date}
              className="group relative flex h-full min-w-0 flex-1 items-end justify-center gap-px"
              title={`${day.date}: ${day.toolCalls} tool calls, ${day.agentVisits} agent visits`}
            >
              <span
                className="w-[42%] max-w-2 rounded-t-sm bg-neutral-300 transition-colors group-hover:bg-neutral-400"
                style={{ height: `${visitHeight}%` }}
              />
              <span
                className="w-[42%] max-w-2 rounded-t-sm bg-blue-600 transition-colors group-hover:bg-blue-500"
                style={{ height: `${toolHeight}%` }}
              />
              {index % labelEvery === 0 && (
                <span className="absolute top-full mt-2 whitespace-nowrap text-[10px] text-neutral-400">
                  {new Intl.DateTimeFormat("en", {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(`${day.date}T00:00:00Z`))}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="h-7" />
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border-l border-neutral-200 pl-4 first:border-l-0 first:pl-0 sm:first:border-l sm:first:pl-4">
      <dt className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">
        {label}
      </dt>
      <dd className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950 tabular-nums">
        {value}
      </dd>
      <p className="mt-1 text-xs text-neutral-500">{detail}</p>
    </div>
  );
}

function InsightStrip({
  analytics,
  managedTools,
}: {
  analytics: AgentAnalytics;
  managedTools: string[];
}) {
  const topTool = analytics.tools[0];
  const canonicalToolName = (name: string) =>
    name.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  const usedToolNames = new Set(
    analytics.tools.map((row) => canonicalToolName(row.tool)),
  );
  const unusedCount = managedTools.filter(
    (tool) => !usedToolNames.has(canonicalToolName(tool)),
  ).length;
  const reliabilityIssues =
    analytics.summary.failedCalls +
    analytics.summary.manifestFetchFailures +
    analytics.summary.manifestRejections;

  return (
    <div className="grid overflow-hidden rounded-lg border border-neutral-200 bg-white md:grid-cols-3 md:divide-x md:divide-neutral-200">
      <div className="p-4">
        <p className="text-[11px] font-semibold tracking-wide text-blue-700 uppercase">
          Top intent
        </p>
        <p className="mt-2 text-sm font-semibold text-neutral-950">
          {topTool
            ? topTool.tool.replaceAll("_", " ")
            : "Waiting for tool calls"}
        </p>
        <p className="mt-1 text-xs leading-5 text-neutral-500">
          {topTool
            ? `${Math.round((topTool.calls / Math.max(1, analytics.summary.toolCalls)) * 100)}% of all agent actions in this period.`
            : "The first invocation will reveal what agents ask this site to do."}
        </p>
      </div>
      <div className="border-t border-neutral-200 p-4 md:border-t-0">
        <p className="text-[11px] font-semibold tracking-wide text-amber-700 uppercase">
          Coverage gap
        </p>
        <p className="mt-2 text-sm font-semibold text-neutral-950">
          {unusedCount === 0
            ? "Every live tool was used"
            : `${unusedCount} live tool${unusedCount === 1 ? "" : "s"} unused`}
        </p>
        <p className="mt-1 text-xs leading-5 text-neutral-500">
          {unusedCount === 0
            ? "Your published surface is receiving agent demand."
            : "Review naming and descriptions if expected tools stay undiscovered."}
        </p>
      </div>
      <div className="border-t border-neutral-200 p-4 md:border-t-0">
        <p className="text-[11px] font-semibold tracking-wide text-emerald-700 uppercase">
          Reliability
        </p>
        <p className="mt-2 text-sm font-semibold text-neutral-950">
          {reliabilityIssues === 0
            ? "No recorded failures"
            : `${reliabilityIssues} issue${reliabilityIssues === 1 ? "" : "s"} recorded`}
        </p>
        <p className="mt-1 text-xs leading-5 text-neutral-500">
          Tool failures, rejected manifests, and loader fetch failures combined.
        </p>
      </div>
    </div>
  );
}

export function AgentAnalyticsDashboard({
  repoId,
  managedTools,
  analytics,
}: {
  repoId: string;
  managedTools: string[];
  analytics: AgentAnalytics;
}) {
  const successRate = analytics.summary.toolCalls
    ? Math.round(
        (analytics.summary.successfulCalls / analytics.summary.toolCalls) * 100,
      )
    : 0;
  const hasActivity =
    analytics.summary.agentVisits +
      analytics.summary.toolCalls +
      analytics.summary.answerEngineVisits >
    0;

  return (
    <section id="agent-analytics" className="scroll-mt-6 space-y-5">
      <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-5 border-b border-neutral-100 px-5 py-5 sm:px-6">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-emerald-700 uppercase">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Collecting from agent.js
              </span>
              <span className="text-xs text-neutral-400">
                No prompts or page content collected
              </span>
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-neutral-950 text-balance">
              Agent analytics
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500 text-pretty">
              See what compatible browser agents ask your site to do, whether
              tools succeed, and which answer engines send people your way.
            </p>
          </div>
          <RangePicker repoId={repoId} days={analytics.periodDays} />
        </div>
        <dl className="grid gap-y-5 px-5 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <Metric
            label="Agent-ready visits"
            value={number.format(analytics.summary.agentVisits)}
            detail="Loader initialized with WebMCP"
          />
          <Metric
            label="Tool calls"
            value={number.format(analytics.summary.toolCalls)}
            detail={`${number.format(analytics.tools.length)} unique tools used`}
          />
          <Metric
            label="Success rate"
            value={analytics.summary.toolCalls ? `${successRate}%` : "—"}
            detail={`${number.format(analytics.summary.failedCalls)} failed calls`}
          />
          <Metric
            label="P95 latency"
            value={formatLatency(analytics.summary.p95LatencyMs)}
            detail={`Average ${formatLatency(analytics.summary.averageLatencyMs)}`}
          />
        </dl>
      </section>

      {!hasActivity && (
        <section className="rounded-lg border border-blue-200 bg-blue-50 px-5 py-4">
          <p className="text-sm font-semibold text-blue-950">
            Waiting for the first agent visit
          </p>
          <p className="mt-1 text-sm leading-6 text-blue-800/80">
            Data appears automatically after the installed script loads in a
            compatible WebMCP browser, a tool runs, or someone follows a link
            from a recognized answer engine.
          </p>
        </section>
      )}

      <InsightStrip analytics={analytics} managedTools={managedTools} />

      <section className="rounded-lg border border-neutral-200 bg-white p-5 sm:p-6">
        <ActivityChart analytics={analytics} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.45fr_0.75fr]">
        <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <header className="border-b border-neutral-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-neutral-950">
              What agents ask your site to do
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Exact invocations from the tools Sodium manages.
            </p>
          </header>
          {analytics.tools.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-neutral-500">
              No tool calls in this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] tracking-wide text-neutral-400 uppercase">
                  <tr>
                    <th className="px-5 py-3 font-medium">Tool</th>
                    <th className="px-3 py-3 text-right font-medium">Calls</th>
                    <th className="px-3 py-3 text-right font-medium">
                      Success
                    </th>
                    <th className="px-3 py-3 text-right font-medium">P95</th>
                    <th className="hidden px-5 py-3 text-right font-medium sm:table-cell">
                      Last used
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {analytics.tools.map((tool) => (
                    <tr key={tool.tool}>
                      <td className="px-5 py-3.5 font-mono text-xs font-medium text-neutral-900">
                        {tool.tool}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums">
                        {number.format(tool.calls)}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums">
                        {Math.round(
                          (tool.successfulCalls / Math.max(1, tool.calls)) *
                            100,
                        )}
                        %
                      </td>
                      <td className="px-3 py-3.5 text-right text-neutral-500 tabular-nums">
                        {formatLatency(tool.p95LatencyMs)}
                      </td>
                      <td className="hidden px-5 py-3.5 text-right text-xs whitespace-nowrap text-neutral-500 sm:table-cell">
                        {formatDate(tool.lastUsedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white">
          <header className="border-b border-neutral-100 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-neutral-950">
                Answer engine traffic
              </h2>
              <span className="text-lg font-semibold tabular-nums">
                {number.format(analytics.summary.answerEngineVisits)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-neutral-500">
              Recognized AI products that sent a referrer or source tag.
            </p>
          </header>
          {analytics.engines.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-neutral-500">
              No attributable answer-engine visits in this period.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100 px-5">
              {analytics.engines.map((engine) => (
                <li
                  key={engine.engine}
                  className="flex items-center justify-between gap-4 py-3.5"
                >
                  <div>
                    <p className="text-sm font-medium text-neutral-900">
                      {engine.engine}
                    </p>
                    <p className="mt-0.5 text-[11px] text-neutral-400">
                      Last visit {formatDate(engine.lastVisitAt)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    {number.format(engine.visits)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-neutral-100 px-5 py-3 text-[11px] leading-5 text-neutral-400">
            Best-effort attribution. WebMCP does not reveal the calling
            provider, and browser privacy settings can remove referrers.
          </p>
        </section>
      </div>
    </section>
  );
}
