import type { ComponentType, CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  dailyRange,
  type AgentAnalytics,
  type AgentAnalyticsDay,
} from "@/lib/agent-analytics";
import { ANSWER_ENGINE_COUNT } from "@/lib/answer-engines";
import { VIZ_MUTED, VIZ_SERIES, VIZ_STATUS } from "@/lib/viz";
import {
  ActivityChart,
  EngineList,
  EngineRadar,
  Sparkline,
  ToolTimeline,
} from "./analytics-charts";
import { cn, frameClass } from "./ui";
import {
  BroadcastIcon,
  ChartLineUpIcon,
  CircleNotchIcon,
  LockKeyIcon,
  PulseIcon,
  RobotIcon,
  SealCheckIcon,
  ShieldCheckIcon,
  TargetIcon,
  TimerIcon,
  WrenchIcon,
} from "./icons";

/** Phosphor icons take their size from the caller and their color from style. */
type IconComponent = ComponentType<{
  className?: string;
  style?: CSSProperties;
  weight?: "regular" | "bold" | "fill";
  "aria-hidden"?: boolean;
}>;

const number = new Intl.NumberFormat("en-US");

/*
 * Card's shell, rebuilt from its parts (see `Card` in ./ui). Analytics surfaces
 * cannot use that component directly — they sit under this section's `h2` so
 * their titles must be `h3`, and the stat rows wear the shell as `dt`/`dd` to
 * stay one description list — but every one of them matches it class for class.
 */
const cardHeadClass = "border-b border-white/[0.07] px-4 py-3";
const cardTitleClass =
  "flex items-center gap-2 text-sm font-medium text-neutral-100 text-balance";
const cardBodyClass = "p-4";

function formatLatency(value: number): string {
  if (!value) return "—";
  if (value < 1_000) return `${number.format(value)} ms`;
  return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)} s`;
}

function RangePicker({ repoId, days }: { repoId: string; days: number }) {
  return (
    <nav
      aria-label="Analytics date range"
      className="flex rounded-md border border-white/10 bg-white/[0.04] p-0.5"
    >
      {[7, 30, 90].map((range) => (
        <Link
          key={range}
          href={`/repos/${repoId}?range=${range}d#agent-analytics`}
          aria-current={range === days ? "page" : undefined}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            range === days
              ? "bg-white/10 text-neutral-100"
              : "text-neutral-400 hover:text-neutral-100",
          )}
        >
          {range}d
        </Link>
      ))}
    </nav>
  );
}

/** A charted subsection of the dashboard, in Card's shell with an `h3` title. */
function Panel({
  title,
  description,
  icon: Icon,
  aside,
  children,
}: {
  title: string;
  description: string;
  icon?: IconComponent;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={frameClass}>
      <header
        className={`${cardHeadClass} flex flex-wrap items-center justify-between gap-x-4 gap-y-2`}
      >
        <h3 className={cardTitleClass}>
          {Icon && <Icon aria-hidden className="size-4 shrink-0 text-faint" />}
          {title}
        </h3>
        {aside}
      </header>
      <div className={cardBodyClass}>
        <p className="mb-4 text-sm text-neutral-400 text-pretty">
          {description}
        </p>
        {children}
      </div>
    </section>
  );
}

/**
 * One headline number over its own daily series. Every tile in the row draws
 * the same line, so the four read as one instrument panel and a difference in
 * shape is a difference in the data.
 */
export function Metric({
  label,
  accent,
  icon: Icon,
  value,
  detail,
  series,
  max,
}: {
  label: string;
  accent: string;
  icon: IconComponent;
  value: string;
  detail: string;
  series: number[];
  /** Pin the chart's ceiling, for a series that is already a percentage. */
  max?: number;
}) {
  return (
    <div className={frameClass}>
      <dt className={`${cardHeadClass} ${cardTitleClass}`}>
        <Icon
          aria-hidden
          weight="fill"
          className="size-4 shrink-0"
          style={{ color: accent }}
        />
        {label}
      </dt>
      <dd className={cardBodyClass}>
        <p className="text-2xl font-medium tabular-nums text-neutral-100">
          {value}
        </p>
        <p className="mt-1 text-xs text-neutral-400 text-pretty">{detail}</p>
        <Sparkline values={series} color={accent} label={label} max={max} />
      </dd>
    </div>
  );
}

/**
 * Wears Card's shell — framed panel, bordered title strip — but keeps `dt`/`dd`
 * so the three insights stay one description list rather than three sections.
 */
function Insight({
  label,
  accent,
  icon: Icon,
  headline,
  detail,
  pending = false,
}: {
  label: string;
  accent: string;
  icon: IconComponent;
  headline: string;
  detail: string;
  pending?: boolean;
}) {
  return (
    <div className={frameClass}>
      <dt className={`${cardHeadClass} ${cardTitleClass}`}>
        <Icon
          aria-hidden
          weight="fill"
          className="size-4 shrink-0"
          style={{ color: accent }}
        />
        {label}
      </dt>
      <dd className={cardBodyClass}>
        <p className="flex items-center gap-2 text-sm font-medium text-neutral-100 text-pretty">
          {pending ? (
            <CircleNotchIcon
              aria-hidden
              className="size-4 shrink-0 animate-spin text-faint motion-reduce:animate-none"
            />
          ) : null}
          {headline}
        </p>
        <p className="mt-1 text-sm leading-6 text-neutral-400 text-pretty">
          {detail}
        </p>
      </dd>
    </div>
  );
}

/**
 * Success as a daily rate. A day with no calls has no rate of its own, so the
 * series holds the last measured level instead of dropping to zero.
 */
function successByDay(days: AgentAnalyticsDay[]): number[] {
  let held = 0;
  return days.map((day) => {
    if (day.toolCalls > 0) {
      held = (day.successfulCalls / day.toolCalls) * 100;
    }
    return held;
  });
}

function Insights({
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
  // Before the first call, "unused" is a fact about traffic, not about coverage.
  const awaitingFirstCall = analytics.summary.toolCalls === 0;
  const reliabilityIssues =
    analytics.summary.failedCalls +
    analytics.summary.manifestFetchFailures +
    analytics.summary.manifestRejections;

  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      <Insight
        label="Top intent"
        icon={TargetIcon}
        accent={topTool ? VIZ_SERIES[0] : VIZ_MUTED}
        pending={!topTool}
        headline={
          topTool
            ? topTool.tool.replaceAll("_", " ")
            : "Waiting for agent interactions"
        }
        detail={
          topTool
            ? `${Math.round((topTool.calls / Math.max(1, analytics.summary.toolCalls)) * 100)}% of all agent actions in this period.`
            : "The first invocation will reveal what agents ask this site to do."
        }
      />
      <Insight
        label="Coverage gap"
        icon={WrenchIcon}
        accent={
          awaitingFirstCall
            ? VIZ_MUTED
            : unusedCount === 0
              ? VIZ_STATUS.good
              : VIZ_STATUS.warning
        }
        headline={
          awaitingFirstCall
            ? `${managedTools.length} live tool${managedTools.length === 1 ? "" : "s"} ready`
            : unusedCount === 0
              ? "Every live tool was used"
              : `${unusedCount} live tool${unusedCount === 1 ? "" : "s"} unused`
        }
        detail={
          awaitingFirstCall
            ? "Once calls arrive, this names the tools agents never reach for."
            : unusedCount === 0
              ? "Your published surface is receiving agent demand."
              : "Review naming and descriptions if expected tools stay undiscovered."
        }
      />
      <Insight
        label="Reliability"
        icon={ShieldCheckIcon}
        accent={reliabilityIssues === 0 ? VIZ_STATUS.good : VIZ_STATUS.critical}
        headline={
          reliabilityIssues === 0
            ? "No recorded failures"
            : `${reliabilityIssues} issue${reliabilityIssues === 1 ? "" : "s"} recorded`
        }
        detail="Tool failures, rejected manifests, and loader fetch failures combined."
      />
    </dl>
  );
}

function LegendKey({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-0.5 w-3 rounded-full"
        style={{ backgroundColor: color }}
      />
      {children}
    </span>
  );
}

export function AgentAnalyticsDashboard({
  repoId,
  managedTools,
  analytics,
  locked = false,
  unlockAction,
}: {
  repoId: string;
  managedTools: string[];
  analytics: AgentAnalytics;
  locked?: boolean;
  unlockAction?: ReactNode;
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

  const days: AgentAnalyticsDay[] = dailyRange(analytics);
  const visitsByEngine = new Map(
    analytics.engines.map((engine) => [engine.engine, engine.visits]),
  );
  const enginesSeen = [...visitsByEngine.values()].filter(
    (visits) => visits > 0,
  ).length;
  const successColor =
    successRate >= 95
      ? VIZ_STATUS.good
      : successRate >= 80
        ? VIZ_STATUS.warning
        : VIZ_STATUS.critical;

  return (
    <section
      id="agent-analytics"
      aria-labelledby="agent-analytics-title"
      className="scroll-mt-6 space-y-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id="agent-analytics-title"
            className="flex items-center gap-2 text-base font-medium text-balance"
          >
            <ChartLineUpIcon
              aria-hidden
              className="size-4.5 shrink-0 text-faint"
            />
            Agent analytics
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-400 text-pretty">
            See what compatible browser agents ask your site to do, whether
            tools succeed, and which answer engines send people your way.
          </p>
          <p
            className={cn(
              "mt-2 inline-flex items-center gap-1.5 text-xs font-medium",
              locked ? "text-blue-400" : "text-emerald-400",
            )}
          >
            {locked ? (
              <LockKeyIcon aria-hidden weight="fill" className="size-4" />
            ) : (
              <BroadcastIcon aria-hidden className="size-4" />
            )}
            {locked ? "Preview mode" : "Collecting from agent.js"}
          </p>
          <p className="mt-1 text-xs text-faint">
            No prompts or page content collected
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          {locked ? unlockAction : null}
          <RangePicker repoId={repoId} days={analytics.periodDays} />
        </div>
      </header>

      {!hasActivity && !locked && (
        <div className="border-l-2 border-blue-500 pl-3">
          <p className="flex items-center gap-2 text-sm font-medium text-neutral-100">
            <PulseIcon aria-hidden className="size-4 shrink-0 text-blue-400" />
            Waiting for the first agent visit
          </p>
          <p className="mt-0.5 max-w-3xl text-sm leading-6 text-neutral-400 text-pretty">
            Data appears automatically after the installed script loads in a
            compatible WebMCP browser, a tool runs, or someone follows a link
            from a recognized answer engine.
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric
          label="Agent-ready visits"
          icon={RobotIcon}
          accent={VIZ_MUTED}
          value={number.format(analytics.summary.agentVisits)}
          detail="Loader initialized with WebMCP"
          series={days.map((day) => day.agentVisits)}
        />
        <Metric
          label="Tool calls"
          icon={WrenchIcon}
          accent={VIZ_SERIES[0]}
          value={number.format(analytics.summary.toolCalls)}
          detail={`${number.format(analytics.tools.length)} unique tools used`}
          series={days.map((day) => day.toolCalls)}
        />
        <Metric
          label="Success rate"
          icon={SealCheckIcon}
          accent={analytics.summary.toolCalls ? successColor : VIZ_MUTED}
          value={analytics.summary.toolCalls ? `${successRate}%` : "—"}
          detail={`${number.format(analytics.summary.failedCalls)} failed calls`}
          series={successByDay(days)}
          max={100}
        />
        <Metric
          label="P95 latency"
          icon={TimerIcon}
          accent={VIZ_SERIES[6]}
          value={formatLatency(analytics.summary.p95LatencyMs)}
          detail={`Average ${formatLatency(analytics.summary.averageLatencyMs)}`}
          series={days.map((day) => day.p95LatencyMs)}
        />
      </dl>

      <Panel
        title="Agent activity"
        icon={PulseIcon}
        description="Compatible-agent visits and completed tool calls, by UTC day."
        aside={
          <div className="flex items-center gap-4 text-xs text-neutral-400">
            <LegendKey color={VIZ_SERIES[0]}>Tool calls</LegendKey>
            <LegendKey color={VIZ_MUTED}>Agent visits</LegendKey>
          </div>
        }
      >
        <ActivityChart days={days} hasActivity={hasActivity} />
      </Panel>

      <Panel
        title="What agents ask your site to do"
        icon={WrenchIcon}
        description="Every tool Sodium manages, and the days agents actually invoked it."
      >
        <ToolTimeline
          analytics={analytics}
          managedTools={managedTools}
          days={days}
        />
      </Panel>

      <Panel
        title="Answer engine traffic"
        icon={BroadcastIcon}
        description={`Visits referred by a recognized AI product. Sodium attributes ${ANSWER_ENGINE_COUNT} engines.`}
        aside={
          <span className="flex items-baseline gap-1.5">
            <span className="text-lg leading-none font-medium tabular-nums text-neutral-100">
              {number.format(analytics.summary.answerEngineVisits)}
            </span>
            <span className="text-xs text-faint">visits</span>
          </span>
        }
      >
        <div className="grid items-center gap-8 sm:grid-cols-[minmax(0,288px)_minmax(0,1fr)]">
          <div>
            <EngineRadar visitsByEngine={visitsByEngine} />
            <p className="mt-3 text-center text-xs text-faint">
              {enginesSeen} of {ANSWER_ENGINE_COUNT} engines seen in the last{" "}
              {analytics.periodDays} days
            </p>
          </div>
          <EngineList visitsByEngine={visitsByEngine} />
        </div>
        <p className="mt-4 text-[11px] leading-5 text-faint text-pretty">
          Best-effort attribution. WebMCP does not reveal the calling provider,
          and browser privacy settings can remove referrers.
        </p>
      </Panel>

      <Insights analytics={analytics} managedTools={managedTools} />
    </section>
  );
}
