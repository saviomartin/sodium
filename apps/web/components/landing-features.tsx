import type { ComponentType, CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { signInWithGithubAction } from "@/lib/actions";
import { ANSWER_ENGINE_COUNT } from "@/lib/answer-engines";
import { siteUrl } from "@/lib/env";
import { EngineRadar, Sparkline } from "./analytics-charts";
import { SnippetCode } from "./copy-snippet";
import { GithubSignInForm } from "./github-sign-in-form";
import { cn, CtaArrow, heroButtonClass } from "./ui";
import {
  ArrowCounterClockwiseIcon,
  BroadcastIcon,
  ClockCounterClockwiseIcon,
  CodeIcon,
  FingerprintIcon,
  RobotIcon,
  SealCheckIcon,
  TerminalWindowIcon,
  TimerIcon,
  WrenchIcon,
} from "./icons";

/**
 * The four things Sodium does, as one bordered grid on the page's light band.
 *
 * Everything here is drawn for paper rather than for ink: the dark app's
 * surfaces carry white text, checkered frames and hues validated against
 * #1e1e1e, none of which survive a move to #f1eee7. So the cells restate the
 * product's shapes — snippet, stat row, attribution, version history — in the
 * band's own palette, and the only chrome is the grid's hairline. The one
 * borrowed piece is the snippet itself, which stays a dark inset because that
 * is what a code block looks like in the app and on paper alike.
 *
 * The previews restate the prose beside them and hold no real controls, so
 * they are hidden from assistive tech rather than read out twice.
 */

/** A sample site, not a real one: previews must never imply a customer. */
const SAMPLE_SITE_ID = "site_7k2md9x4qp1v0a3b";

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
const VISITS = [
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

/**
 * A month of referrals, out of every engine Sodium can attribute. The headline
 * counts are derived from this list rather than written beside it, so the total
 * and the "seen" count can never disagree with the bars underneath them.
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

/** Phosphor icons take their size from the caller and their colour from style. */
type IconComponent = ComponentType<{
  className?: string;
  style?: CSSProperties;
  weight?: "regular" | "bold" | "fill";
  "aria-hidden"?: boolean;
}>;

const number = new Intl.NumberFormat("en-US");

/* ------------------------------------------------------------------ *
 * The four previews.
 * ------------------------------------------------------------------ */

/** The install snippet, in the dark inset the repository page gives it. */
function SnippetPreview() {
  const snippet = `<script src="${siteUrl()}/agent/v1.js" data-site="${SAMPLE_SITE_ID}"></script>`;

  return (
    <div>
      <div className="overflow-hidden rounded-md bg-ink-950">
        <p className="flex items-center gap-1.5 border-b border-white/[0.07] px-3 py-1.5 font-mono text-[11px] text-faint">
          <TerminalWindowIcon aria-hidden className="size-3.5" />
          index.html · &lt;head&gt;
        </p>
        <SnippetCode snippet={snippet} />
      </div>
      {/* `items-center`, not `items-baseline`: the term is itself a flex row
          led by an icon and the value is `truncate`, so both synthesize their
          baseline from a bottom edge and baseline alignment lifts the term off
          the value. Both boxes are one `text-xs` line tall, so centring them
          puts the two text baselines exactly together. */}
      <dl className="mt-3 flex items-center gap-2">
        <dt className="flex shrink-0 items-center gap-1 text-xs text-cream-muted">
          <FingerprintIcon aria-hidden className="size-3.5" />
          Site ID
        </dt>
        <dd className="min-w-0 truncate font-mono text-xs text-cream-ink">
          {SAMPLE_SITE_ID}
        </dd>
      </dl>
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
        label="Agent-ready visits"
        icon={RobotIcon}
        accent={ACCENT.muted}
        value="9,952"
        series={VISITS}
      />
      <Stat
        label="Tool calls"
        icon={WrenchIcon}
        accent={ACCENT.blue}
        value="4,161"
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
        <span className="text-xl font-medium tabular-nums text-cream-ink">
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
                <dd className="shrink-0 tabular-nums text-cream-ink">
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

/** A row of the version history: the live one, then rollback targets. */
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
      {/* Both trailing columns are fixed width: "Signed" is narrower than
          "Roll back", and without a floor the tool counts would step left
          and right down the list. */}
      <span className="hidden w-14 shrink-0 text-right text-xs tabular-nums text-cream-muted @xs:block">
        {tools} tools
      </span>
      <span className="flex w-[4.75rem] shrink-0 justify-end text-xs">
        {live ? (
          <span className="inline-flex items-center gap-1 text-[#0e7a34]">
            <SealCheckIcon aria-hidden weight="fill" className="size-3.5" />
            Signed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-cream-muted">
            <ArrowCounterClockwiseIcon aria-hidden className="size-3.5" />
            Roll back
          </span>
        )}
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
 * Install, publish, measure, attribute — the order you meet them in.
 *
 * It also pairs the two list-shaped previews on the first row and the two
 * chart-shaped ones on the second, so neither row is a tall cell beside a
 * short one with a hand's width of paper under it.
 */
const FEATURES: Feature[] = [
  {
    id: "install",
    title: "One line of code",
    icon: CodeIcon,
    description:
      "Add one script tag. Every tool you approve goes live behind it.",
    preview: <SnippetPreview />,
  },
  {
    id: "versions",
    title: "Versions & rollback",
    icon: ClockCounterClockwiseIcon,
    description: "Every publish is signed and versioned. Roll back anytime.",
    preview: <VersionsPreview />,
  },
  {
    id: "analytics",
    title: "Agent analytics",
    icon: RobotIcon,
    description:
      "Visits, tool calls, success rate and latency, measured for you.",
    preview: <AnalyticsPreview />,
  },
  {
    id: "engines",
    title: "Answer engine traffic",
    icon: BroadcastIcon,
    description: `See which of ${ANSWER_ENGINE_COUNT} AI products send people to your site.`,
    preview: <EnginesPreview />,
  },
];

export function LandingFeatures({
  next,
  signedIn = false,
}: {
  next: string;
  /** Signed in, "Get started" is a jump to your repositories, not a sign-in. */
  signedIn?: boolean;
}) {
  const cta = signedIn ? (
    <Link href="#start" className={heroButtonClass}>
      Get started
      <CtaArrow />
    </Link>
  ) : (
    <GithubSignInForm
      action={signInWithGithubAction}
      next={next}
      label="Get started"
      className={heroButtonClass}
    />
  );

  return (
    // The section shell — id, heading, light band — belongs to the page's
    // `Section` wrapper, so what is left here is the grid and the call to
    // action under it, which the four cells have just made the case for.
    <>
      {/*
       * Cells draw their own right and bottom edge and the grid draws its top
       * and left, so every rule is exactly one line wide however the columns
       * collapse. Each cell is its own container: what a preview does with the
       * room it gets is a question about the cell, not about the viewport, and
       * the two answers part company as soon as the grid goes single-column.
       */}
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

      <div className="mt-10 flex justify-center">{cta}</div>
    </>
  );
}
