import { ANSWER_ENGINES, answerEngineBrand } from "@/lib/answer-engines";
import type { DailyAnalytics, ToolRollup } from "@/lib/tool-analytics";
import {
  VIZ_AXIS,
  VIZ_GRID,
  VIZ_MUTED,
  VIZ_RAMP,
  VIZ_SERIES,
  VIZ_SURFACE,
  linePath,
  niceMax,
  pointX,
  rampBucket,
  seriesColor,
} from "@/lib/viz";
import { AnswerEngineLogo } from "./answer-engine-mark";
import { cn } from "./ui";

const number = new Intl.NumberFormat("en-US");

const dayLabel = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function labelForDay(date: string): string {
  return dayLabel.format(new Date(`${date}T00:00:00Z`));
}

/** The blue used for the primary series, and its wash. */
const PRIMARY = VIZ_SERIES[0];

/** A dotted rule, so the floor of a chart never competes with its line. */
const DOTTED = { dasharray: "0.6 2.4", linecap: "round" as const };

/* ------------------------------------------------------------------ *
 * Sparkline — the trend strip every stat tile shares.
 * ------------------------------------------------------------------ */

/** Drawn when a tile has nothing to plot yet: a trend, not a ruled diagonal. */
const GHOST_TREND = [9, 12, 10, 14, 13, 15, 14, 18, 16, 20, 19, 22];

export function Sparkline({
  values,
  color,
  label,
  max: pinnedMax,
  axis = VIZ_AXIS,
}: {
  values: number[];
  color: string;
  label: string;
  /** Pin the top of the scale, for series that are already a percentage. */
  max?: number;
  /** The baseline rule. Defaults to the dark chrome; the light band overrides. */
  axis?: string;
}) {
  const live = values.some((value) => value > 0);
  const series = live ? values : GHOST_TREND;
  const floor = live ? 0 : Math.min(...series);
  const top = Math.max(
    1,
    live && pinnedMax ? pinnedMax : Math.max(...series, 0),
  );
  const line = linePath(
    series,
    (value) => 100 - ((value - floor) / (top - floor)) * 86,
  );
  const id = `spark-${label.replaceAll(/[^a-z0-9]/gi, "")}`;
  /*
   * The area is what makes a count read as a quantity, so a count keeps it.
   * A pinned series is a rate, and a rate's reading is its distance from the
   * ceiling, not from zero — filling underneath a line that sits at 97 turns
   * the whole strip into a solid block and hides the only variation there is.
   */
  const filled = live ? !pinnedMax : true;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="mt-4 h-9 w-full overflow-visible"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor={color}
            stopOpacity={live ? 0.26 : 0.14}
          />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {filled && (
        <path d={`${line} L 100,100 L 0,100 Z`} fill={`url(#${id})`} />
      )}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeOpacity={live ? 1 : 0.55}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="0"
        x2="100"
        y1="100"
        y2="100"
        stroke={axis}
        strokeWidth="1"
        strokeDasharray={DOTTED.dasharray}
        strokeLinecap={DOTTED.linecap}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Activity chart — two series over time.
 * ------------------------------------------------------------------ */

/** Decoration for the zero state: a trend with weather in it, not a diagonal. */
const SAMPLE_TREND = [
  10, 13, 11, 15, 14, 16, 15, 19, 17, 21, 20, 19, 23, 22, 26, 24, 28, 27, 31,
  29, 33,
];
const SAMPLE_LINE = linePath(SAMPLE_TREND, (value) => {
  const floor = Math.min(...SAMPLE_TREND);
  const top = Math.max(...SAMPLE_TREND);
  return 100 - 12 - ((value - floor) / (top - floor)) * 76;
});

/**
 * Tool calls against SDK sessions, by UTC day.
 *
 * Calls are the filled primary series and sessions the muted line behind it:
 * a session is the opportunity, a call is the thing that happened, so the
 * distance between the two lines is the readable quantity.
 */
export function ActivityChart({
  days,
  hasActivity,
}: {
  days: DailyAnalytics[];
  hasActivity: boolean;
}) {
  const rawMax = Math.max(
    0,
    ...days.flatMap((day) => [day.calls, day.sdkSessions]),
  );
  const max = rawMax > 0 ? niceMax(rawMax) : 1;
  const y = (value: number) => 100 - (value / max) * 100;
  const series = (pick: (day: DailyAnalytics) => number) =>
    linePath(days.map(pick), y);

  const callLine = series((day) => day.calls);
  const sessionLine = series((day) => day.sdkSessions);
  const labelEvery = days.length > 45 ? 15 : days.length > 14 ? 7 : 2;

  return (
    <figure className="m-0">
      <div className="grid grid-cols-[auto_1fr] gap-x-3">
        {/* y axis */}
        <div className="flex h-44 flex-col justify-between py-px text-right text-[10px] text-faint tabular-nums">
          <span>{rawMax > 0 ? number.format(max) : ""}</span>
          <span>{rawMax > 0 ? number.format(max / 2) : ""}</span>
          <span>0</span>
        </div>

        <div className="relative h-44">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-0 size-full overflow-visible"
          >
            <defs>
              <linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PRIMARY} stopOpacity="0.32" />
                <stop offset="100%" stopColor={PRIMARY} stopOpacity="0" />
              </linearGradient>
              <linearGradient id="activity-ghost" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PRIMARY} stopOpacity="0.16" />
                <stop offset="100%" stopColor={PRIMARY} stopOpacity="0" />
              </linearGradient>
            </defs>

            {[0, 50, 100].map((line) => (
              <line
                key={line}
                x1="0"
                x2="100"
                y1={line}
                y2={line}
                stroke={line === 100 ? VIZ_AXIS : VIZ_GRID}
                strokeWidth="1"
                strokeDasharray={line === 100 ? DOTTED.dasharray : undefined}
                strokeLinecap={line === 100 ? DOTTED.linecap : undefined}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {!hasActivity && (
              <>
                <path
                  d={`${SAMPLE_LINE} L 100,100 L 0,100 Z`}
                  fill="url(#activity-ghost)"
                />
                <path
                  d={SAMPLE_LINE}
                  fill="none"
                  stroke={PRIMARY}
                  strokeOpacity="0.55"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}

            {hasActivity && days.length > 0 && (
              <>
                <path
                  d={`${callLine} L 100,100 L 0,100 Z`}
                  fill="url(#activity-fill)"
                />
                <path
                  d={sessionLine}
                  fill="none"
                  stroke={VIZ_MUTED}
                  strokeOpacity="0.9"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={callLine}
                  fill="none"
                  stroke={PRIMARY}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
          </svg>

          {/* Hover layer: one full-height target per day. */}
          {hasActivity && (
            <div className="absolute inset-0 flex">
              {days.map((day, index) => {
                const share = days.length > 1 ? index / (days.length - 1) : 0.5;
                const slot = 100 / days.length;
                const local =
                  days.length > 1 ? (share * 100 - index * slot) / slot : 0.5;
                const align =
                  share < 0.15
                    ? "left-0"
                    : share > 0.85
                      ? "right-0"
                      : "left-1/2 -translate-x-1/2";
                return (
                  <div
                    key={day.date}
                    className="group relative h-full min-w-0 flex-1"
                  >
                    <span
                      className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-white/0 transition-colors group-hover:bg-white/15"
                      style={{ left: `${local * 100}%` }}
                    />
                    <span
                      className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 ring-2 ring-panel transition-opacity group-hover:opacity-100"
                      style={{
                        left: `${local * 100}%`,
                        top: `${y(day.calls)}%`,
                        backgroundColor: PRIMARY,
                      }}
                    />
                    <div
                      className={cn(
                        "pointer-events-none absolute bottom-full z-10 mb-2 hidden w-max rounded-md border border-white/10 bg-ink-800 px-2.5 py-1.5 text-xs shadow-lg group-hover:block",
                        align,
                      )}
                    >
                      <p className="font-medium text-neutral-100">
                        {labelForDay(day.date)}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-neutral-300 tabular-nums">
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: PRIMARY }}
                        />
                        {number.format(day.calls)} tool calls
                      </p>
                      <p className="flex items-center gap-1.5 text-neutral-300 tabular-nums">
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: VIZ_MUTED }}
                        />
                        {number.format(day.sdkSessions)} SDK sessions
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* x axis */}
        <div />
        <div className="relative mt-2 h-4">
          {days.map((day, index) => {
            if (index % labelEvery !== 0) return null;
            const x = pointX(index, days.length);
            return (
              <span
                key={day.date}
                className={cn(
                  "absolute text-[10px] whitespace-nowrap text-faint",
                  // A centered label at either end hangs half its width past
                  // the plot, where the card's padding clips it. The end ticks
                  // sit inside their own edge instead, as the tooltip does.
                  x <= 10 ? "" : x >= 90 ? "-translate-x-full" : "-translate-x-1/2",
                )}
                style={{ left: `${x}%` }}
              >
                {labelForDay(day.date)}
              </span>
            );
          })}
        </div>
      </div>

      <figcaption className="sr-only">
        <table>
          <caption>Tool calls and SDK sessions by UTC day</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Tool calls</th>
              <th scope="col">SDK sessions</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date}>
                <th scope="row">{day.date}</th>
                <td>{day.calls}</td>
                <td>{day.sdkSessions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ *
 * Tool timeline — when each deployed tool was actually called.
 * ------------------------------------------------------------------ */

/** How many lanes fit before the list stops being scannable. */
const VISIBLE_LANES = 8;

/**
 * Every tool in the deployed contract, and the days agents reached for it.
 *
 * The lane is the point: a tool nobody calls is as important a fact as a busy
 * one, and only a row per deployed tool can show the difference between "no
 * demand" and "not published".
 */
export function ToolTimeline({
  tools,
  days,
}: {
  tools: ToolRollup[];
  days: DailyAnalytics[];
}) {
  if (tools.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-white/12 px-4 py-8 text-center text-sm text-neutral-400 text-pretty">
        No tools are deployed for this project yet. Run{" "}
        <code className="text-neutral-200">npx sodiumtools deploy</code> to
        publish your contract.
      </p>
    );
  }

  const live = tools.some((tool) => tool.calls > 0);

  // Hue follows the tool's identity, not its rank, so a busier week never
  // repaints the lanes.
  const stableOrder = [...tools]
    .map((tool) => tool.name)
    .sort((a, b) => a.localeCompare(b));
  const hueFor = (name: string) => seriesColor(stableOrder.indexOf(name));

  const cellMax = Math.max(
    1,
    ...tools.flatMap((tool) => tool.daily.map((day) => day.calls)),
  );
  const visible = tools.slice(0, VISIBLE_LANES);
  const laneClass =
    "grid grid-cols-[minmax(104px,200px)_minmax(140px,1fr)_auto_auto] items-center gap-x-4";

  return (
    <div>
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="min-w-[440px]">
          <div
            className={cn(
              laneClass,
              "mb-2 text-[10px] font-medium uppercase text-faint",
            )}
          >
            <span>Tool</span>
            <span>{live ? "When it ran" : "Awaiting first call"}</span>
            <span className="w-12 text-right">Calls</span>
            <span className="w-14 text-right">Success</span>
          </div>

          <ul className="divide-y divide-white/[0.05]">
            {visible.map((tool) => {
              const byDate = new Map(
                tool.daily.map((day) => [day.date, day.calls]),
              );
              const hue = hueFor(tool.name);
              return (
                <li key={tool.id} className={cn(laneClass, "py-2")}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: hue }}
                    />
                    <span className="truncate font-mono text-xs text-neutral-100">
                      {tool.name}
                    </span>
                  </span>

                  <span
                    className="flex h-5 items-stretch gap-px"
                    aria-hidden="true"
                  >
                    {days.map((day) => {
                      const calls = byDate.get(day.date) ?? 0;
                      const bucket = rampBucket(calls, cellMax);
                      return (
                        <span
                          key={day.date}
                          title={`${tool.name} · ${labelForDay(day.date)}: ${number.format(calls)} calls`}
                          className="min-w-px flex-1 rounded-[2px]"
                          style={{
                            backgroundColor:
                              bucket < 0
                                ? "rgba(255,255,255,0.07)"
                                : VIZ_RAMP[bucket],
                          }}
                        />
                      );
                    })}
                  </span>

                  <span
                    className={cn(
                      "w-12 text-right text-sm tabular-nums",
                      tool.calls ? "text-neutral-100" : "text-faint",
                    )}
                  >
                    {number.format(tool.calls)}
                  </span>
                  <span className="w-14 text-right text-xs text-neutral-400 tabular-nums">
                    {tool.successRate === null
                      ? "—"
                      : `${Math.round(tool.successRate * 100)}%`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[10px] text-faint">
        <span className="tabular-nums">
          {days.length > 0
            ? `${labelForDay(days[0]!.date)} to ${labelForDay(days[days.length - 1]!.date)}`
            : ""}
        </span>
        <span className="inline-flex items-center gap-1.5">
          Less
          <span className="inline-flex gap-px">
            <span
              className="size-2 rounded-[2px]"
              style={{ backgroundColor: "rgba(255,255,255,0.07)" }}
            />
            {VIZ_RAMP.map((color) => (
              <span
                key={color}
                className="size-2 rounded-[2px]"
                style={{ backgroundColor: color }}
              />
            ))}
          </span>
          More
        </span>
      </div>

      {tools.length > visible.length && (
        <p className="mt-2 text-[11px] text-faint">
          Showing the {visible.length} busiest of {tools.length} tools.
        </p>
      )}

      {!live && (
        <p className="mt-3 border-l-2 border-white/12 pl-3 text-xs leading-5 text-neutral-400 text-pretty">
          {tools.length} tool{tools.length === 1 ? " is" : "s are"} deployed and
          callable. Each lane fills in on the day an agent first invokes it.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Answer engine radar — coverage across every engine we can attribute.
 * ------------------------------------------------------------------ */

const RADAR_RINGS = [0.25, 0.5, 0.75, 1];
/** Outer ring radius and brand-logo orbit, as a share of the square's side. */
const RING_SPAN = 0.32;
const LOGO_ORBIT = 0.425;

function radarPoint(index: number, count: number, radius: number) {
  const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
  return {
    x: 50 + Math.cos(angle) * radius * 100,
    y: 50 + Math.sin(angle) * radius * 100,
  };
}

function polygon(count: number, radius: number): string {
  return Array.from({ length: count }, (_, index) => {
    const { x, y } = radarPoint(index, count, radius);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

/**
 * Coverage across every engine, as one shape.
 *
 * The colour props exist because the landing page draws this on paper: the
 * rings, the dot halo and the plotted hue all have to change ground together
 * or the shape stops reading. They default to the dark chrome, so the
 * dashboard passes none of them.
 */
export function EngineRadar({
  visitsByEngine,
  className = "max-w-[280px]",
  logoClass = "size-7",
  accent = PRIMARY,
  grid = VIZ_GRID,
  surface = VIZ_SURFACE,
  logoInk,
}: {
  visitsByEngine: Map<string, number>;
  /** Sizes the square. Replaces the default width cap rather than joining it. */
  className?: string;
  logoClass?: string;
  /** The plotted shape's hue, and the wash under it. */
  accent?: string;
  /** Rings and spokes. */
  grid?: string;
  /** The ground the dots are haloed against, so they read off the shape. */
  surface?: string;
  /** Ink for the marks their brands publish as monochrome. */
  logoInk?: string;
}) {
  const count = ANSWER_ENGINES.length;
  const max = Math.max(
    0,
    ...ANSWER_ENGINES.map((engine) => visitsByEngine.get(engine.name) ?? 0),
  );
  const points = ANSWER_ENGINES.map((engine, index) => {
    const visits = visitsByEngine.get(engine.name) ?? 0;
    const radius = max > 0 ? (visits / max) * RING_SPAN : 0;
    return { engine, visits, ...radarPoint(index, count, radius) };
  });

  return (
    <div className={cn("relative mx-auto aspect-square w-full", className)}>
      <svg viewBox="0 0 100 100" aria-hidden="true" className="size-full">
        <defs>
          <radialGradient id="radar-wash">
            <stop offset="0%" stopColor={accent} stopOpacity="0.07" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
        </defs>
        <polygon points={polygon(count, RING_SPAN)} fill="url(#radar-wash)" />
        {RADAR_RINGS.map((ring) => (
          <polygon
            key={ring}
            points={polygon(count, RING_SPAN * ring)}
            fill="none"
            stroke={grid}
            strokeWidth="0.5"
          />
        ))}
        {ANSWER_ENGINES.map((engine, index) => {
          const { x, y } = radarPoint(index, count, RING_SPAN);
          return (
            <line
              key={engine.name}
              x1="50"
              y1="50"
              x2={x}
              y2={y}
              stroke={grid}
              strokeWidth="0.4"
            />
          );
        })}

        {max > 0 ? (
          <>
            <polygon
              points={points
                .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
                .join(" ")}
              fill={accent}
              fillOpacity="0.26"
              stroke={accent}
              strokeWidth="1"
              strokeLinejoin="round"
            />
            {points
              .filter((point) => point.visits > 0)
              .map((point) => (
                <circle
                  key={point.engine.name}
                  cx={point.x}
                  cy={point.y}
                  r="1.9"
                  fill={accent}
                  stroke={surface}
                  strokeWidth="1"
                />
              ))}
          </>
        ) : (
          <circle cx="50" cy="50" r="1.4" fill={VIZ_MUTED} fillOpacity="0.6" />
        )}
      </svg>

      {ANSWER_ENGINES.map((engine, index) => {
        const { x, y } = radarPoint(index, count, LOGO_ORBIT);
        const visits = visitsByEngine.get(engine.name) ?? 0;
        return (
          <span
            key={engine.name}
            title={`${engine.name}: ${number.format(visits)} visits`}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <AnswerEngineLogo
              engine={engine.name}
              dimmed={max > 0 && visits === 0}
              ink={logoInk}
              className={logoClass}
            />
          </span>
        );
      })}
    </div>
  );
}

export function EngineList({
  visitsByEngine,
}: {
  visitsByEngine: Map<string, number>;
}) {
  const known = new Set<string>(ANSWER_ENGINES.map((engine) => engine.name));
  const extras = [...visitsByEngine.keys()].filter((name) => !known.has(name));
  const rows = [...ANSWER_ENGINES.map((engine) => engine.name), ...extras].sort(
    (a, b) =>
      (visitsByEngine.get(b) ?? 0) - (visitsByEngine.get(a) ?? 0) ||
      a.localeCompare(b),
  );
  const max = Math.max(0, ...rows.map((name) => visitsByEngine.get(name) ?? 0));

  return (
    <ul className="grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((name) => {
        const visits = visitsByEngine.get(name) ?? 0;
        const host = answerEngineBrand(name).host;
        return (
          <li key={name} className="flex items-center gap-3 py-2">
            <AnswerEngineLogo
              engine={name}
              dimmed={max > 0 && visits === 0}
              className="size-7"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm leading-5 text-neutral-100">
                {name}
              </span>
              {host && (
                <span className="block truncate text-xs leading-4 text-faint">
                  {host}
                </span>
              )}
            </span>
            <span
              className={cn(
                "text-base tabular-nums",
                visits > 0 ? "font-medium text-neutral-100" : "text-faint",
              )}
            >
              {number.format(visits)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
