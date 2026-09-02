import type { ComponentType, ReactNode } from "react";
import {
  CONFIRMATION_POLICIES,
  RISK_LABELS,
  type ConfirmationPolicy,
  type RiskLevel,
} from "sodium-webmcp-spec";
import {
  ArrowRightIcon,
  ArrowUUpLeftIcon,
  CheckIcon,
  CreditCardIcon,
  EyeIcon,
  HandTapIcon,
  PencilSimpleIcon,
  ShieldCheckIcon,
  WarningIcon,
} from "./icons";

/** Server-safe presentational primitives. Dark ink surfaces, one accent. */

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Phosphor icons render at 1em, so size comes from the caller's text size. */
export type IconComponent = ComponentType<{
  className?: string;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  "aria-hidden"?: boolean;
}>;

/**
 * The trailing mark on a call to action. It reads as "this moves you forward"
 * and nudges on hover, which the button classes enable by declaring `group`.
 */
export function CtaArrow({ className }: { className?: string }) {
  return (
    <ArrowRightIcon
      aria-hidden
      weight="bold"
      className={cn(
        "size-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none",
        className,
      )}
    />
  );
}

/**
 * The trailing mark on an action that switches something on rather than moving
 * to a next step.
 */
export function CtaCheck({ className }: { className?: string }) {
  return (
    <CheckIcon
      aria-hidden
      weight="bold"
      className={cn(
        "size-4 shrink-0 transition-transform duration-150 group-hover:scale-110 motion-reduce:transition-none",
        className,
      )}
    />
  );
}

/**
 * Every surface in the app wears the same checkered frame, at one size. The
 * `frame` class in globals.css does the work on a single element; this name
 * exists so call sites read as intent rather than as a bare class.
 */
export const frameClass = "frame";

/** The title strip and body of a framed panel, as parts. */
export const cardHeadClass = "border-b border-white/[0.07] px-4 py-3";
export const cardTitleClass =
  "flex items-center gap-2 text-sm font-medium text-neutral-100 text-balance";
export const cardBodyClass = "p-4";

export function Card({
  title,
  icon: Icon,
  children,
  actions,
  bodyClass = cardBodyClass,
}: {
  title?: string;
  icon?: IconComponent;
  children: ReactNode;
  actions?: ReactNode;
  /** For a body that runs edge to edge, like a table or a divided list. */
  bodyClass?: string;
}) {
  return (
    // `min-w-0`: a Card is usually a grid item, and a grid item's automatic
    // minimum size is its content's min-content width. One long snippet or
    // route pattern would otherwise hold the whole column open past the
    // viewport.
    <section className={cn(frameClass, "min-w-0")}>
      {(title || actions) && (
        <header
          className={cn(
            cardHeadClass,
            "flex flex-wrap items-center justify-between gap-x-4 gap-y-2",
          )}
        >
          {title ? (
            <h2 className={cardTitleClass}>
              {Icon && (
                <Icon aria-hidden className="size-4 shrink-0 text-faint" />
              )}
              {title}
            </h2>
          ) : (
            <span />
          )}
          {actions}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  hint,
  icon: Icon,
  action,
}: {
  title: string;
  hint?: ReactNode;
  icon?: IconComponent;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {Icon && (
        <span className="mb-1 flex size-9 items-center justify-center rounded-full bg-white/[0.06] text-neutral-300">
          <Icon aria-hidden className="size-4.5" />
        </span>
      )}
      <p className="text-sm font-medium text-neutral-100">{title}</p>
      {hint && (
        <p className="max-w-md text-sm leading-6 text-neutral-400 text-pretty">
          {hint}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Each risk level carries a glyph, so the tier is legible before the label. */
const RISK_STYLES: Record<
  RiskLevel,
  { className: string; icon: IconComponent }
> = {
  read_only: { className: "bg-white/10 text-neutral-300", icon: EyeIcon },
  reversible: {
    className: "bg-blue-500/15 text-blue-300",
    icon: ArrowUUpLeftIcon,
  },
  state_changing: {
    className: "bg-amber-500/15 text-amber-300",
    icon: PencilSimpleIcon,
  },
  destructive: {
    className: "bg-red-500/15 text-red-300",
    icon: WarningIcon,
  },
  financial: {
    className: "bg-red-500/25 text-red-200",
    icon: CreditCardIcon,
  },
};

const badgeClass =
  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap";

/**
 * A tool's risk tier. A contract off a deployment has been validated against
 * the spec, but a row can still be rendered from a telemetry event whose tool
 * has since left the config, so an unrecognised level renders as itself rather
 * than crashing the table it sits in.
 */
export function RiskBadge({ risk }: { risk: string }) {
  const style = RISK_STYLES[risk as RiskLevel];
  if (!style) {
    return (
      <span className={cn(badgeClass, "bg-white/[0.06] text-faint")}>
        {risk.replaceAll("_", " ")}
      </span>
    );
  }
  const { className, icon: Icon } = style;
  return (
    <span className={cn(badgeClass, className)}>
      <Icon aria-hidden weight="fill" className="size-3.5 shrink-0" />
      {RISK_LABELS[risk as RiskLevel]}
    </span>
  );
}

/**
 * How much the user is asked before a tool runs. The floor is derived from
 * risk by the spec, so this is the only place the browser's own prompt policy
 * becomes visible in the dashboard.
 */
const CONFIRMATION_STYLES: Record<
  ConfirmationPolicy,
  { className: string; icon: IconComponent; label: string }
> = {
  none: {
    className: "bg-white/[0.06] text-faint",
    icon: EyeIcon,
    label: "No prompt",
  },
  recommended: {
    className: "bg-blue-500/15 text-blue-300",
    icon: HandTapIcon,
    label: "Prompt advised",
  },
  required: {
    className: "bg-emerald-500/15 text-emerald-300",
    icon: ShieldCheckIcon,
    label: "Prompt required",
  },
};

export function ConfirmationBadge({ policy }: { policy: string }) {
  const style = CONFIRMATION_POLICIES.includes(policy as ConfirmationPolicy)
    ? CONFIRMATION_STYLES[policy as ConfirmationPolicy]
    : null;
  if (!style) return <span className="text-xs text-faint">—</span>;
  const { className, icon: Icon, label } = style;
  return (
    <span className={cn(badgeClass, className)}>
      <Icon aria-hidden weight="fill" className="size-3.5 shrink-0" />
      {label}
    </span>
  );
}

/**
 * A rate as a bar plus its number. The thresholds are the reliability bands
 * the dashboard uses everywhere: 95% and up is healthy, 80% is worth a look,
 * below that is a problem.
 */
export function RateMeter({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-xs text-faint tabular-nums">—</span>;
  }
  const percent = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-1.5 w-12 overflow-hidden rounded-full bg-white/10"
        role="presentation"
      >
        <span
          className={cn(
            "block h-full",
            percent >= 95
              ? "bg-emerald-400"
              : percent >= 80
                ? "bg-amber-400"
                : "bg-red-400",
          )}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="text-xs text-neutral-400 tabular-nums">{percent}%</span>
    </span>
  );
}

/**
 * Marks a surface that is built but not yet wired to anything.
 *
 * It exists so a panel can ship its real layout ahead of its backend without
 * lying: the shape is final, the controls are inert, and this says so in the
 * header rather than leaving a reader to discover it by clicking. Delete the
 * badge, not the panel, when the feature lands.
 */
export function SoonBadge({ children = "Soon" }: { children?: ReactNode }) {
  return (
    <span
      className={cn(
        badgeClass,
        "border border-white/12 bg-white/[0.04] text-faint uppercase",
      )}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-400">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs text-faint text-pretty">
          {hint}
        </span>
      )}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-white/12 bg-white/[0.04] px-3 py-1.5 text-sm text-neutral-100 placeholder:text-faint focus:border-blue-500 focus:outline-2 focus:outline-blue-500/30";

/**
 * Primary. Hover brightens rather than darkens, which is the way round dark
 * needs. `group` lets a trailing CtaArrow track the button's own hover.
 */
export const buttonClass =
  "group inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50";

export const secondaryButtonClass =
  "group inline-flex items-center justify-center gap-1.5 rounded-md border border-white/12 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-white/[0.09] hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50";

export const dangerButtonClass =
  "group inline-flex items-center justify-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-300 hover:bg-red-500/20 hover:text-red-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:opacity-50";

/** Same primary, sized up for the landing call to action. */
export const heroButtonClass =
  "group inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50";
