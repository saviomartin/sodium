import type { CSSProperties, ComponentType, ReactNode } from "react";
import { ANSWER_ENGINE_COUNT } from "@/lib/answer-engines";
import { EngineRadar, Sparkline } from "./analytics-charts";
import { JsonCode } from "./json-code";
import { cn } from "./ui";
import {
  ArrowCounterClockwiseIcon,
  BracketsCurlyIcon,
  BroadcastIcon,
  ChartLineUpIcon,
  ClockCounterClockwiseIcon,
  CursorClickIcon,
  EyeIcon,
  SealCheckIcon,
  ShieldCheckIcon,
  SignpostIcon,
  TerminalWindowIcon,
  TimerIcon,
  WarningIcon,
  WrenchIcon,
} from "./icons";

/**
 * The case for building this way, as one bordered grid on the page's light
 * band.
 *
 * Everything here is drawn for paper rather than for ink: the dark app's
 * surfaces carry white text, checkered frames and hues validated against
 * #232323, none of which survive a move to #f1eee7. So the cells restate the
 * product's shapes — contract, command run, tool table, stat row — in the
 * band's own palette, and the only chrome is the grid's hairline. The one
 * borrowed piece is the snippet itself, which stays a dark inset because that
 * is what a code block looks like in the app and on paper alike.
 *
 * The previews restate the prose beside them and hold no real controls, so
 * they are hidden from assistive tech rather than read out twice.
 */

/**
 * Series hues for the light band.
 *
 * `lib/viz` is validated against the dark panel and three of its slots fall
 * under 3:1 on cream, so the band carries its own four. Same roles, same
 * order, re-picked to clear the graphics floor on #f1eee7.
 */
const ACCENT = {
  muted: "#6a6459",
  blue: "#2f6fd0",
  green: "#0e7a34",
  violet: "#6a55c9",
} as const;

/**
 * The band's colours as literals, for the SVG attributes and inline styles
 * that cannot read a Tailwind class. Keep in step with the `--color-cream*`
 * tokens in globals.css.
 */
const BAND = {
  paper: "#f1eee7",
  ink: "#17150f",
  /** Sparkline baselines and radar rings: chrome, never content. */
  rule: "rgba(23,21,15,0.14)",
};

/** Thirty days of weekday-heavy traffic on a gentle upward ramp. */
const SESSIONS = [
  212, 168, 247, 268, 241, 152, 141, 295, 318, 284, 336, 312, 191, 174, 359,
  381, 342, 410, 371, 220, 203, 428, 451, 405, 480, 439, 254, 237, 462, 418,
];
const CALLS = [
  88, 70, 103, 112, 101, 63, 59, 123, 133, 119, 140, 130, 80, 73, 150, 159, 143,
  171, 155, 92, 85, 179, 188, 169, 200, 183, 106, 99, 193, 175,
];
const SUCCESS_RATE = [
  97, 98, 99, 99, 98, 99, 100, 99, 99, 98, 99, 99, 100, 99, 99, 100, 99, 98, 99,
  99, 100, 99, 99, 100, 99, 99, 98, 99, 100, 99,
];
const P95 = [
  486, 512, 448, 470, 501, 462, 439, 494, 523, 478, 455, 508, 466, 441, 497,
  519, 472, 450, 505, 468, 443, 499, 521, 476, 452, 510, 464, 447, 493, 494,
];

/** Phosphor icons take their size from the caller and their colour from style. */
type IconComponent = ComponentType<{
  className?: string;
  style?: CSSProperties;
  weight?: "regular" | "bold" | "fill";
  "aria-hidden"?: boolean;
}>;

const number = new Intl.NumberFormat("en-US");

/* ------------------------------------------------------------------ *
 * The previews.
 * ------------------------------------------------------------------ */

/**
 * One tool out of a sodium.json, in the dark inset a code block gets.
 *
 * The inset keeps the app's own highlighting rather than restating it for
 * paper: a code block is the one thing on this band that should look exactly
 * as it does in an editor.
 */
const CONTRACT = `{
  "name": "book_appointment",
  "on": ["/booking/**"],
  "run": { "form": { "selector": "#book" } },
  "risk": "state_changing"
}`;

function ContractPreview() {
  return (
    <div>
      <div className="overflow-hidden rounded-md bg-ink-950">
        <p className="flex items-center gap-1.5 border-b border-white/[0.07] px-3 py-1.5 font-mono text-[11px] text-faint">
          <BracketsCurlyIcon aria-hidden className="size-3.5" />
          sodium.json
        </p>
        <JsonCode snippet={CONTRACT} className="text-[11px]" />
      </div>
      <dl className="mt-3 flex items-center gap-2">
        <dt className="flex shrink-0 items-center gap-1 text-xs text-cream-muted">
          <SignpostIcon aria-hidden className="size-3.5" />
          Lives at
        </dt>
        <dd className="min-w-0 truncate font-mono text-xs text-cream-ink">
          your-app/sodium.json
        </dd>
      </dl>
    </div>
  );
}

/** The commands, as the terminal actually answers them. */
function CommandsPreview() {
  // The two commands the hero teaches, plus the one you reach for when
  // something looks wrong. `login` is left out: it happens once, in a browser,
  // and putting it here would make the path look three steps long.
  const steps: [string, string][] = [
    ["init", "Next.js detected, SDK wired"],
    ["deploy", "v5 published, 7 tools"],
    ["doctor", "config, auth, SDK healthy"],
  ];
  return (
    <div className="overflow-hidden rounded-md bg-ink-950">
      <p className="flex items-center gap-1.5 border-b border-white/[0.07] px-3 py-1.5 font-mono text-[11px] text-faint">
        <TerminalWindowIcon aria-hidden className="size-3.5" />
        your-app
      </p>
      <ol className="divide-y divide-white/[0.05] font-mono text-[11px]">
        {steps.map(([command, result]) => (
          <li
            key={command}
            className="flex items-baseline justify-between gap-3 px-3 py-2"
          >
            <span className="shrink-0 text-neutral-200">
              <span className="text-blue-400">$ </span>
              npx sodiumtools {command}
            </span>
            <span className="inline-flex min-w-0 items-baseline gap-1 truncate text-faint">
              <SealCheckIcon
                aria-hidden
                weight="fill"
                className="size-3 shrink-0 translate-y-px text-emerald-400"
              />
              {result}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One headline number over its own daily series, unboxed. */
function Stat({
  label,
  icon: Icon,
  accent,
  value,
  series,
  max,
}: {
  label: string;
  icon: IconComponent;
  accent: string;
  value: string;
  series: number[];
  /** Pin the chart's ceiling, for a series that is already a percentage. */
  max?: number;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[11px] text-cream-muted">
        <Icon
          aria-hidden
          weight="fill"
          className="size-3.5 shrink-0"
          style={{ color: accent }}
        />
        {label}
      </dt>
      <dd className="mt-0.5">
        <p className="text-xl font-medium tabular-nums text-cream-ink">
          {value}
        </p>
        <Sparkline
          values={series}
          color={accent}
          label={label}
          max={max}
          axis={BAND.rule}
        />
      </dd>
    </div>
  );
}

function AnalyticsPreview() {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
      <Stat
        label="SDK sessions"
        icon={CursorClickIcon}
        accent={ACCENT.muted}
        value={number.format(9952)}
        series={SESSIONS}
      />
      <Stat
        label="Tool calls"
        icon={WrenchIcon}
        accent={ACCENT.blue}
        value={number.format(4161)}
        series={CALLS}
      />
      <Stat
        label="Success rate"
        icon={SealCheckIcon}
        accent={ACCENT.green}
        value="99%"
        series={SUCCESS_RATE}
        max={100}
      />
      <Stat
        label="P95 latency"
        icon={TimerIcon}
        accent={ACCENT.violet}
        value="494 ms"
        series={P95}
      />
    </dl>
  );
}

/**
 * Risk as the contract declares it, and the prompt policy it forces.
 *
 * The pairing is the point: the floor is derived, not chosen, so a destructive
 * tool cannot ship without a confirmation the user has to answer.
 */
const RISKS: {
  tool: string;
  risk: string;
  icon: IconComponent;
  accent: string;
  prompt: string;
}[] = [
  {
    tool: "search_products",
    risk: "Read-only",
    icon: EyeIcon,
    accent: ACCENT.muted,
    prompt: "No prompt",
  },
  {
    tool: "add_to_cart",
    risk: "Reversible",
    icon: ArrowCounterClockwiseIcon,
    accent: ACCENT.blue,
    prompt: "No prompt",
  },
  {
    tool: "book_appointment",
    risk: "State-changing",
    icon: WarningIcon,
    accent: "#a35a00",
    prompt: "Prompt advised",
  },
  {
    tool: "start_checkout",
    risk: "Financial",
    icon: ShieldCheckIcon,
    accent: "#b0322f",
    prompt: "Prompt required",
  },
];

function RiskPreview() {
  return (
    <ol className="divide-y divide-cream-line border-y border-cream-line">
      {RISKS.map((row) => (
        <li key={row.tool} className="flex items-center gap-2.5 py-2">
          <row.icon
            aria-hidden
            weight="fill"
            className="size-3.5 shrink-0"
            style={{ color: row.accent }}
          />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-cream-ink">
            {row.tool}
          </span>
          {/* Both trailing columns are fixed width: the labels differ in
              length, and without a floor the rows would step left and right
              down the list. */}
          <span className="hidden w-24 shrink-0 text-right text-xs text-cream-muted @xs:block">
            {row.risk}
          </span>
          <span className="w-[6.5rem] shrink-0 text-right text-xs text-cream-ink">
            {row.prompt}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A row of the immutable version history: the live one, then earlier deploys. */
function VersionRow({
  version,
  change,
  tools,
  live = false,
}: {
  version: number;
  change: string;
  tools: number;
  live?: boolean;
}) {
  return (
    <li className="flex items-center gap-2.5 py-2">
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          live ? "bg-[#0e7a34]" : "border border-cream-ink/25",
        )}
      />
      <span
        className={cn(
          "font-mono text-sm tabular-nums",
          live ? "text-cream-ink" : "text-cream-muted",
        )}
      >
        v{version}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-cream-muted">
        {change}
      </span>
      {/* Both trailing columns are fixed width so the tool counts and version
          status stay aligned down the list. */}
      <span className="hidden w-14 shrink-0 text-right text-xs text-cream-muted tabular-nums @xs:block">
        {tools} tools
      </span>
      <span
        className={cn(
          "flex w-[4.75rem] shrink-0 items-center justify-end gap-1 text-xs",
          live ? "text-[#0e7a34]" : "text-cream-muted",
        )}
      >
        <SealCheckIcon aria-hidden weight="fill" className="size-3.5" />
        {live ? "Live" : "Signed"}
      </span>
    </li>
  );
}

function VersionsPreview() {
  return (
    <ol className="divide-y divide-cream-line border-y border-cream-line">
      <VersionRow version={5} change="Added book_appointment" tools={7} live />
      <VersionRow version={4} change="Added track_order" tools={7} />
      <VersionRow version={3} change="Updated start_checkout" tools={6} />
      <VersionRow version={2} change="Added add_to_cart" tools={5} />
    </ol>
  );
}

/**
 * A month of referrals, out of every engine Sodium can attribute. The headline
 * counts are derived from this list rather than written beside it, so the total
 * and the "seen" count can never disagree with the shape underneath them.
 */
const ENGINE_VISITS: [string, number][] = [
  ["ChatGPT", 1412],
  ["Perplexity", 706],
  ["Claude", 402],
  ["Gemini", 238],
  ["Copilot", 96],
  ["Grok", 54],
  ["DeepSeek", 22],
  ["Mistral", 10],
  ["You.com", 0],
];

/** The radar plots all nine; the legend beside it names the busiest few. */
const ENGINE_MAP = new Map(ENGINE_VISITS);
const RANKED = 5;

/**
 * Attribution as one shape.
 *
 * The radar is the dashboard's own — every engine gets a spoke, so the gaps
 * are as legible as the peaks — drawn here in the band's ink. The legend
 * beside it puts numbers on the spokes that actually carry traffic.
 */
function EnginesPreview() {
  const total = ENGINE_VISITS.reduce((sum, [, visits]) => sum + visits, 0);
  const seen = ENGINE_VISITS.filter(([, visits]) => visits > 0).length;
  const ranked = ENGINE_VISITS.slice(0, RANKED);
  const rest = seen - ranked.length;
  /** Everything below the last legend row, which is what the remainder says. */
  const floor = ranked.at(-1)![1];

  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-xl font-medium text-cream-ink tabular-nums">
          {number.format(total)}
        </span>
        <span className="text-xs text-cream-muted">
          visits · {seen} of {ANSWER_ENGINE_COUNT} engines seen
        </span>
      </p>

      <div className="mt-4 grid items-center gap-x-6 gap-y-5 @sm:grid-cols-[12rem_minmax(0,18rem)]">
        <EngineRadar
          visitsByEngine={ENGINE_MAP}
          className="max-w-[12rem]"
          logoClass="size-5"
          accent={ACCENT.blue}
          grid={BAND.rule}
          surface={BAND.paper}
          logoInk={BAND.ink}
        />
        <div>
          <dl className="text-sm">
            {ranked.map(([engine, visits]) => (
              <div
                key={engine}
                className="flex items-baseline justify-between gap-3 py-[3px]"
              >
                <dt className="min-w-0 truncate text-cream-ink">{engine}</dt>
                <dd className="shrink-0 text-cream-ink tabular-nums">
                  {number.format(visits)}
                </dd>
              </div>
            ))}
          </dl>
          {rest > 0 && (
            <p className="mt-1.5 text-[11px] text-cream-muted">
              and {rest} more below {number.format(floor)} visits
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The grid.
 * ------------------------------------------------------------------ */

interface Feature {
  id: string;
  title: string;
  icon: IconComponent;
  description: string;
  preview: ReactNode;
}

/**
 * Why this is a better way to build than the alternatives.
 *
 * Each cell is one developer-experience argument, and each preview is the
 * evidence for it: the file you would actually review, the history you would
 * actually roll back, the commands you would actually run. Ordered so the
 * argument builds from the thing that is different about Sodium — your tools
 * are a file — through what that buys you, and only then how little it takes
 * to run. The workflow lands fourth on purpose: it is the least surprising
 * claim on the page, so it does not have to lead.
 *
 * The order also pairs previews by shape: list beside list, chart beside
 * chart, so no row is a tall cell next to a short one with a hand's width of
 * paper under it.
 */
const FEATURES: Feature[] = [
  {
    id: "contract",
    title: "Your tools are a file, not a dashboard",
    icon: BracketsCurlyIcon,
    description:
      "One reviewable file declares every tool. It diffs in a pull request, branches with your feature, and reverts with a git revert. Nothing about your agent surface lives in someone else's database.",
    preview: <ContractPreview />,
  },
  {
    id: "versions",
    title: "Immutable deployment history",
    icon: ClockCounterClockwiseIcon,
    description:
      "Every deploy is an immutable, signed version. Telemetry records which version served each call, so every change and regression has an exact history.",
    preview: <VersionsPreview />,
  },
  {
    id: "risk",
    title: "Risk decides the prompt",
    icon: ShieldCheckIcon,
    description:
      "Declare what a tool can do and Sodium derives the confirmation the browser must ask for. A destructive or financial tool cannot ship without one, because the deploy is rejected below the floor.",
    preview: <RiskPreview />,
  },
  {
    id: "cli",
    title: "Two commands, start to finish",
    icon: TerminalWindowIcon,
    description:
      "Init detects your framework and wires the SDK. Deploy publishes. No setup wizard, no script tag to paste, no API key to copy out of a settings page. Doctor tells you what is wrong when something is.",
    preview: <CommandsPreview />,
  },
  {
    id: "analytics",
    title: "See what agents actually do",
    icon: ChartLineUpIcon,
    description:
      "Sessions, calls, success rate and latency, per tool and per day. Enough to find the tool nobody discovers or the one that keeps failing. Tool names, outcomes and timing only, never prompts or page content.",
    preview: <AnalyticsPreview />,
  },
  {
    id: "engines",
    title: "Answer engine referrals",
    icon: BroadcastIcon,
    description: `See which of ${ANSWER_ENGINE_COUNT} AI products send people to your site, then connect those anonymous sessions to downstream tool usage.`,
    preview: <EnginesPreview />,
  },
];

export function LandingFeatures() {
  return (
    // The section shell — id, heading, light band — belongs to the page's
    // `Section` wrapper, so what is left here is the grid the six cells make.
    //
    // Cells draw their own right and bottom edge and the grid draws its top
    // and left, so every rule is exactly one line wide however the columns
    // collapse. Each cell is its own container: what a preview does with the
    // room it gets is a question about the cell, not about the viewport, and
    // the two answers part company as soon as the grid goes single-column.
    <div className="mt-12 grid border-t border-l border-cream-line lg:grid-cols-2">
      {FEATURES.map((feature) => (
        <article
          key={feature.id}
          className="@container flex flex-col border-r border-b border-cream-line p-6 sm:p-7"
        >
          <h3 className="flex items-center gap-2 text-base font-medium text-cream-ink text-balance">
            <feature.icon
              aria-hidden
              className="size-4 shrink-0 text-cream-muted"
            />
            {feature.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-cream-muted text-pretty">
            {feature.description}
          </p>
          <div aria-hidden className="mt-6 *:w-full">
            {feature.preview}
          </div>
        </article>
      ))}
    </div>
  );
}
