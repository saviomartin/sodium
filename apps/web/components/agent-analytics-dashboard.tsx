import type { CSSProperties, ComponentType, ReactNode } from "react";
import Link from "next/link";
import type { AnalyticsSummary } from "@/lib/tool-analytics";
import { VIZ_MUTED, VIZ_SERIES, VIZ_STATUS } from "@/lib/viz";
import { ActivityChart, Sparkline, ToolTimeline } from "./analytics-charts";
import { EngineInsights } from "./engine-insights";
import {
  cardBodyClass,
  cardHeadClass,
  cardTitleClass,
  cn,
  frameClass,
} from "./ui";
import {
  BroadcastIcon,
  ChartLineUpIcon,
  CircleNotchIcon,
  CursorClickIcon,
  PulseIcon,
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

function formatLatency(value: number | null): string {
  if (value === null) return "—";
  if (value < 1_000) return `${number.format(value)} ms`;
  return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)} s`;
}

function RangePicker({ projectId, days }: { projectId: string; days: number }) {
  return (
    <nav
      aria-label="Analytics date range"
      className="flex rounded-md border border-white/10 bg-white/[0.04] p-0.5"
    >
      {[7, 30, 90].map((range) => (
        <Link
          key={range}
          href={`/projects/${projectId}?range=${range}d#agent-analytics`}
          aria-current={range === days ? "page" : undefined}
          className={cn(
            "rounded px-2.5 py-1 font-mono text-xs font-medium transition-colors",
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
        className={cn(
          cardHeadClass,
          "flex flex-wrap items-center justify-between gap-x-4 gap-y-2",
        )}
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
function Metric({
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
      <dt className={cn(cardHeadClass, cardTitleClass)}>
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
 * Wears Card's shell but keeps `dt`/`dd`, so the three insights stay one
 * description list rather than three sections.
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
      <dt className={cn(cardHeadClass, cardTitleClass)}>
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
 * Success as a daily rate. A day with no completed call has no rate of its
 * own, so the series holds the last measured level instead of dropping to zero
 * and inventing an outage.
 */
function successByDay(analytics: AnalyticsSummary): number[] {
  let held = 0;
  return analytics.days.map((day) => {
    const completed = day.successes + day.failures;
    if (completed > 0) held = (day.successes / completed) * 100;
    return held;
  });
}

function Insights({ analytics }: { analytics: AnalyticsSummary }) {
  const topTool = analytics.tools.find((tool) => tool.calls > 0);
  const unused = analytics.tools.filter((tool) => tool.calls === 0).length;
  // Before the first call, "unused" is a fact about traffic, not about coverage.
  const awaitingFirstCall = analytics.calls === 0;
  const issues = analytics.failures + analytics.registrationFailures;

  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      <Insight
        label="Top intent"
        icon={TargetIcon}
        accent={topTool ? VIZ_SERIES[0] : VIZ_MUTED}
        pending={!topTool}
        headline={topTool ? topTool.title : "Waiting for agent interactions"}
        detail={
          topTool
            ? `${Math.round((topTool.calls / Math.max(1, analytics.calls)) * 100)}% of every tool call in this period.`
            : "The first invocation will reveal what agents ask this app to do."
        }
      />
      <Insight
        label="Coverage gap"
        icon={WrenchIcon}
        accent={
          awaitingFirstCall
            ? VIZ_MUTED
            : unused === 0
              ? VIZ_STATUS.good
              : VIZ_STATUS.warning
        }
        headline={
          awaitingFirstCall
            ? `${analytics.tools.length} deployed tool${analytics.tools.length === 1 ? "" : "s"} ready`
            : unused === 0
              ? "Every deployed tool was used"
              : `${unused} deployed tool${unused === 1 ? "" : "s"} unused`
        }
        detail={
          awaitingFirstCall
            ? "Once calls arrive, this names the tools agents never reach for."
            : unused === 0
              ? "Your whole contract is receiving agent demand."
              : "Review names and descriptions if expected tools stay undiscovered."
        }
      />
      <Insight
        label="Reliability"
        icon={ShieldCheckIcon}
        accent={issues === 0 ? VIZ_STATUS.good : VIZ_STATUS.critical}
        headline={
          issues === 0
            ? "No recorded failures"
            : `${number.format(issues)} issue${issues === 1 ? "" : "s"} recorded`
        }
        detail="Failed tool executions and failed tool registrations combined."
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
  projectId,
  analytics,
}: {
  projectId: string;
  analytics: AnalyticsSummary;
}) {
  const hasActivity = analytics.sdkSessions + analytics.calls > 0;
  const successRate =
    analytics.successRate === null
      ? null
      : Math.round(analytics.successRate * 100);
  const successColor =
    successRate === null
      ? VIZ_MUTED
      : successRate >= 95
        ? VIZ_STATUS.good
        : successRate >= 80
          ? VIZ_STATUS.warning
          : VIZ_STATUS.critical;
  const usedTools = analytics.tools.filter((tool) => tool.calls > 0).length;

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
            What agents ask this app to do, whether the tools succeed, and how
            long they take.
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
            <BroadcastIcon aria-hidden className="size-4" />
            {hasActivity ? "Collecting from the SDK" : "Ready to collect"}
          </p>
          <p className="mt-1 text-xs text-faint">
            Tool names, outcomes and timing only. No prompts, inputs, outputs,
            or page content.
          </p>
        </div>
        <RangePicker projectId={projectId} days={analytics.periodDays} />
      </header>

      {!hasActivity && (
        <div className="border-l-2 border-blue-500 pl-3">
          <p className="flex items-center gap-2 text-sm font-medium text-neutral-100">
            <PulseIcon aria-hidden className="size-4 shrink-0 text-blue-400" />
            Waiting for the first SDK session
          </p>
          <p className="mt-0.5 max-w-3xl text-sm leading-6 text-neutral-400 text-pretty">
            Open your deployed app in a WebMCP-capable browser. Data appears
            automatically once Sodium initializes and a tool runs.
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric
          label="SDK sessions"
          icon={BroadcastIcon}
          accent={VIZ_MUTED}
          value={number.format(analytics.sdkSessions)}
          detail={`${number.format(analytics.registrations)} tool registration${analytics.registrations === 1 ? "" : "s"}`}
          series={analytics.days.map((day) => day.sdkSessions)}
        />
        <Metric
          label="Tool calls"
          icon={WrenchIcon}
          accent={VIZ_SERIES[0]}
          value={number.format(analytics.calls)}
          detail={`${number.format(usedTools)} of ${number.format(analytics.tools.length)} tools used`}
          series={analytics.days.map((day) => day.calls)}
        />
        <Metric
          label="Success rate"
          icon={SealCheckIcon}
          accent={successColor}
          value={successRate === null ? "—" : `${successRate}%`}
          detail={`${number.format(analytics.failures)} failed calls`}
          series={successByDay(analytics)}
          max={100}
        />
        <Metric
          label="P95 latency"
          icon={TimerIcon}
          accent={VIZ_SERIES[6]}
          value={formatLatency(analytics.p95Ms)}
          detail="Completed tool executions"
          series={analytics.days.map((day) => day.p95Ms ?? 0)}
        />
      </dl>

      <Panel
        title="Agent activity"
        icon={PulseIcon}
        description="SDK sessions and completed tool calls, by UTC day."
        aside={
          <div className="flex items-center gap-4 text-xs text-neutral-400">
            <LegendKey color={VIZ_SERIES[0]}>Tool calls</LegendKey>
            <LegendKey color={VIZ_MUTED}>SDK sessions</LegendKey>
          </div>
        }
      >
        <ActivityChart days={analytics.days} hasActivity={hasActivity} />
      </Panel>

      <Panel
        title="What agents ask your app to do"
        icon={CursorClickIcon}
        description="Every tool in the deployed contract, and the days agents actually invoked it."
        aside={
          analytics.denied > 0 ? (
            <span className="text-xs text-amber-300 tabular-nums">
              {number.format(analytics.denied)} denied at the prompt
            </span>
          ) : null
        }
      >
        <ToolTimeline tools={analytics.tools} days={analytics.days} />
      </Panel>

      <EngineInsights
        engines={analytics.engines}
        periodDays={analytics.periodDays}
      />

      <Insights analytics={analytics} />
    </section>
  );
}
