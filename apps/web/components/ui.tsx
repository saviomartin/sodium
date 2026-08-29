import type { ComponentType, ReactNode } from "react";
import {
  RISK_LABELS,
  type CandidateStatus,
  type RiskLevel,
  type RunStatus,
} from "@sodium/contracts";
import {
  ArrowRightIcon,
  ArrowUUpLeftIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  ClockIcon,
  CreditCardIcon,
  EyeIcon,
  PencilSimpleIcon,
  ProhibitIcon,
  SealCheckIcon,
  WarningIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "./icons";

/** Server-safe presentational primitives. Dark ink surfaces, one accent. */

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Phosphor icons render at 1em, so size comes from the caller's text size. */
type IconComponent = ComponentType<{
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
 * Every surface in the app wears the same checkered frame, at one size. The
 * `frame` class in globals.css does the work on a single element; this name
 * exists so call sites read as intent rather than as a bare class.
 */
export const frameClass = "frame";

export function Card({
  title,
  icon: Icon,
  children,
  actions,
}: {
  title?: string;
  icon?: IconComponent;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    // `min-w-0`: a Card is usually a grid item, and a grid item's automatic
    // minimum size is its content's min-content width — one long snippet or
    // origin would otherwise hold the whole column open past the viewport.
    <section className={cn(frameClass, "min-w-0")}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-3">
          {title ? (
            <h2 className="flex items-center gap-2 text-sm font-medium text-neutral-100 text-balance">
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
      <div className="p-4">{children}</div>
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
  hint?: string;
  icon?: IconComponent;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-white/15 px-6 py-10 text-center">
      {Icon && (
        <span className="mb-1 flex size-9 items-center justify-center rounded-full bg-white/[0.06] text-neutral-300">
          <Icon aria-hidden className="size-4.5" />
        </span>
      )}
      <p className="text-sm font-medium text-neutral-100">{title}</p>
      {hint && (
        <p className="max-w-md text-sm text-neutral-400 text-pretty">{hint}</p>
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

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  const { className, icon: Icon } = RISK_STYLES[risk];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      <Icon aria-hidden weight="fill" className="size-3.5 shrink-0" />
      {RISK_LABELS[risk]}
    </span>
  );
}

const STATUS_STYLES: Record<
  CandidateStatus,
  { className: string; icon: IconComponent }
> = {
  proposed: { className: "bg-blue-500/15 text-blue-300", icon: SealCheckIcon },
  needs_review: {
    className: "bg-amber-500/15 text-amber-300",
    icon: WarningCircleIcon,
  },
  approved: {
    className: "bg-emerald-500/15 text-emerald-300",
    icon: CheckCircleIcon,
  },
  rejected: {
    className: "bg-white/[0.06] text-faint line-through",
    icon: XCircleIcon,
  },
  published: {
    className: "bg-emerald-500/25 text-emerald-200",
    icon: SealCheckIcon,
  },
};

export function StatusBadge({ status }: { status: CandidateStatus }) {
  const { className, icon: Icon } = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      <Icon aria-hidden weight="fill" className="size-3.5 shrink-0" />
      {status.replace("_", " ")}
    </span>
  );
}

const RUN_STATUS_STYLES: Record<
  RunStatus,
  { className: string; icon: IconComponent; spin?: boolean }
> = {
  queued: { className: "bg-white/10 text-neutral-300", icon: ClockIcon },
  running: {
    className: "bg-blue-500/15 text-blue-300",
    icon: CircleNotchIcon,
    spin: true,
  },
  succeeded: {
    className: "bg-emerald-500/15 text-emerald-300",
    icon: CheckCircleIcon,
  },
  failed: { className: "bg-red-500/15 text-red-300", icon: XCircleIcon },
  canceled: { className: "bg-white/[0.06] text-faint", icon: ProhibitIcon },
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const { className, icon: Icon, spin } = RUN_STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <Icon
        aria-hidden
        weight={spin ? "bold" : "fill"}
        className={cn(
          "size-3.5 shrink-0",
          spin && "animate-spin motion-reduce:animate-none",
        )}
      />
      {status}
    </span>
  );
}

export function ConfidenceMeter({ value }: { value: number }) {
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
            percent >= 75
              ? "bg-emerald-400"
              : percent >= 50
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

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
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
