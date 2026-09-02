import Link from "next/link";
import type { AnalyticsSummary, DailyAnalytics } from "@/lib/tool-analytics";
import { cn, frameClass } from "./ui";
import {
  BroadcastIcon,
  ChartLineUpIcon,
  PulseIcon,
  SealCheckIcon,
  ShieldCheckIcon,
  TimerIcon,
  WarningCircleIcon,
  WrenchIcon,
} from "./icons";

const number = new Intl.NumberFormat("en-US");

function percentage(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function duration(value: number | null): string {
  if (value === null) return "—";
  return value < 1000
    ? `${number.format(value)} ms`
    : `${(value / 1000).toFixed(1)} s`;
}

function metricPath(values: number[], width: number, height: number): string {
  const max = Math.max(...values, 1);
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
      const y = height - (value / max) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 160 36"
      preserveAspectRatio="none"
      className="mt-4 h-9 w-full overflow-visible"
    >
      <path d="M0 35.5H160" stroke="rgba(255,255,255,.08)" />
      <path
        d={metricPath(values, 160, 34)}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Metric({
  label,
  value,
  detail,
  values,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  values: number[];
  accent: string;
}) {
  return (
    <div className={frameClass}>
      <div className="border-b border-white/[0.07] px-4 py-3 text-xs text-neutral-400">
        {label}
      </div>
      <div className="px-4 py-4">
        <p className="text-2xl font-medium tabular-nums tracking-tight text-neutral-100">
          {value}
        </p>
        <p className="mt-1 text-xs text-neutral-500">{detail}</p>
        <Sparkline values={values} color={accent} />
      </div>
    </div>
  );
}

function ActivityChart({ days }: { days: DailyAnalytics[] }) {
  const max = Math.max(
    ...days.flatMap((day) => [day.calls, day.sdkSessions]),
    1,
  );

  return (
    <div>
      <div className="flex h-48 items-end gap-1" aria-hidden>
        {days.map((day) => (
          <div
            key={day.date}
            className="group relative flex h-full min-w-0 flex-1 items-end gap-px"
          >
            <span
              className="min-h-px flex-1 bg-blue-400/80"
              style={{ height: `${Math.max((day.calls / max) * 100, 0.5)}%` }}
            />
            <span
              className="min-h-px flex-1 bg-white/20"
              style={{
                height: `${Math.max((day.sdkSessions / max) * 100, 0.5)}%`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-white/[0.07] pt-3 text-[11px] text-neutral-600">
        <time dateTime={days[0]?.date}>{days[0]?.date}</time>
        <span className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 bg-blue-400" /> Tool calls
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 bg-white/30" /> SDK sessions
          </span>
        </span>
        <time dateTime={days.at(-1)?.date}>{days.at(-1)?.date}</time>
      </div>
    </div>
  );
}

function RangePicker({ projectId, days }: { projectId: string; days: number }) {
  return (
    <nav aria-label="Analytics date range" className="flex gap-1 font-mono">
      {[7, 30, 90].map((range) => (
        <Link
          key={range}
          href={`/projects/${projectId}?range=${range}d`}
          aria-current={range === days ? "page" : undefined}
          className={cn(
            "rounded px-2.5 py-1.5 text-xs transition-colors",
            range === days
              ? "bg-neutral-100 text-neutral-950"
              : "text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-200",
          )}
        >
          {range}d
        </Link>
      ))}
    </nav>
  );
}

export function AgentAnalyticsDashboard({
  projectId,
  analytics,
}: {
  projectId: string;
  analytics: AnalyticsSummary;
}) {
  const hasEvents = Boolean(analytics.lastSeenAt);
  const reliabilityIssues = analytics.failures + analytics.registrationFailures;
  const topTool = analytics.tools.find((tool) => tool.calls > 0);

  return (
    <section aria-labelledby="agent-analytics-title" className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-blue-400">
            Live telemetry
          </p>
          <h2
            id="agent-analytics-title"
            className="mt-2 flex items-center gap-2 text-xl font-medium text-neutral-100"
          >
            <ChartLineUpIcon aria-hidden className="size-5 text-faint" />
            Agent analytics
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-400">
            Real SDK activity. Sodium records tool names, outcomes, and
            timing—never prompts, inputs, outputs, or page content.
          </p>
        </div>
        <RangePicker projectId={projectId} days={analytics.periodDays} />
      </header>

      {!hasEvents && (
        <div className="border-l-2 border-blue-400 py-1 pl-4">
          <p className="flex items-center gap-2 text-sm font-medium text-neutral-100">
            <PulseIcon aria-hidden className="size-4 text-blue-400" />
            Waiting for the first SDK session
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Open the deployed app in a WebMCP-capable browser. Events appear
            here automatically when Sodium initializes and tools run.
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="SDK sessions"
          value={number.format(analytics.sdkSessions)}
          detail="Successful SDK initializations"
          values={analytics.days.map((day) => day.sdkSessions)}
          accent="#a3a3a3"
        />
        <Metric
          label="Tool calls"
          value={number.format(analytics.calls)}
          detail={`${number.format(analytics.tools.filter((tool) => tool.calls > 0).length)} tools used`}
          values={analytics.days.map((day) => day.p95Ms ?? 0)}
          accent="#60a5fa"
        />
        <Metric
          label="Success rate"
          value={percentage(analytics.successRate)}
          detail={`${number.format(analytics.failures)} failed calls`}
          values={analytics.days.map((day) => {
            const completed = day.successes + day.failures;
            return completed ? (day.successes / completed) * 100 : 0;
          })}
          accent="#34d399"
        />
        <Metric
          label="P95 latency"
          value={duration(analytics.p95Ms)}
          detail="Completed tool executions"
          values={analytics.days.map((day) => day.calls)}
          accent="#c4b5fd"
        />
      </dl>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,0.7fr)]">
        <section className={frameClass}>
          <header className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
            <PulseIcon aria-hidden className="size-4 text-faint" />
            <h3 className="text-sm font-medium text-neutral-100">Activity</h3>
          </header>
          <div className="p-4">
            <ActivityChart days={analytics.days} />
          </div>
        </section>

        <section className={frameClass}>
          <header className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
            <BroadcastIcon aria-hidden className="size-4 text-faint" />
            <h3 className="text-sm font-medium text-neutral-100">Signals</h3>
          </header>
          <dl className="divide-y divide-white/[0.07] px-4">
            <Signal
              icon={topTool ? WrenchIcon : PulseIcon}
              label="Top intent"
              value={topTool?.name.replaceAll("_", " ") ?? "Waiting for calls"}
            />
            <Signal
              icon={reliabilityIssues ? WarningCircleIcon : ShieldCheckIcon}
              label="Reliability"
              value={
                reliabilityIssues
                  ? `${number.format(reliabilityIssues)} recorded issue${reliabilityIssues === 1 ? "" : "s"}`
                  : "No recorded failures"
              }
              tone={reliabilityIssues ? "text-amber-300" : "text-emerald-300"}
            />
            <Signal
              icon={SealCheckIcon}
              label="Registrations"
              value={`${number.format(analytics.registrations)} successful`}
            />
            <Signal
              icon={TimerIcon}
              label="Denied by users"
              value={number.format(analytics.denied)}
            />
          </dl>
        </section>
      </div>
    </section>
  );
}

function Signal({
  icon: Icon,
  label,
  value,
  tone = "text-neutral-200",
}: {
  icon: typeof WrenchIcon;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="py-4">
      <dt className="flex items-center gap-2 text-xs text-neutral-500">
        <Icon aria-hidden className="size-3.5" /> {label}
      </dt>
      <dd className={cn("mt-1 truncate text-sm", tone)}>{value}</dd>
    </div>
  );
}
