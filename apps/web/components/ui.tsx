import type { ReactNode } from "react";
import {
  RISK_LABELS,
  type CandidateStatus,
  type RiskLevel,
  type RunStatus,
} from "@sodium/contracts";

/** Server-safe presentational primitives. Tailwind defaults, one accent. */

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function Card({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      {(title || actions) && (
        <header className="flex items-center justify-between gap-4 border-b border-neutral-100 px-4 py-3">
          {title ? (
            <h2 className="text-sm font-semibold text-balance">{title}</h2>
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
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && (
        <p className="max-w-md text-sm text-neutral-500 text-pretty">{hint}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const RISK_STYLES: Record<RiskLevel, string> = {
  read_only: "bg-neutral-100 text-neutral-700",
  reversible: "bg-blue-50 text-blue-700",
  state_changing: "bg-amber-50 text-amber-800",
  destructive: "bg-red-50 text-red-700",
  financial: "bg-red-100 text-red-800",
};

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span
      className={cn(
        "inline-flex rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        RISK_STYLES[risk],
      )}
    >
      {RISK_LABELS[risk]}
    </span>
  );
}

const STATUS_STYLES: Record<CandidateStatus, string> = {
  proposed: "bg-blue-50 text-blue-700",
  needs_review: "bg-amber-50 text-amber-800",
  approved: "bg-green-50 text-green-700",
  rejected: "bg-neutral-100 text-neutral-500 line-through",
  published: "bg-green-100 text-green-800",
};

export function StatusBadge({ status }: { status: CandidateStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_STYLES[status],
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

const RUN_STATUS_STYLES: Record<RunStatus, string> = {
  queued: "bg-neutral-100 text-neutral-600",
  running: "bg-blue-50 text-blue-700",
  succeeded: "bg-green-50 text-green-700",
  failed: "bg-red-50 text-red-700",
  canceled: "bg-neutral-100 text-neutral-500",
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded px-1.5 py-0.5 text-xs font-medium",
        RUN_STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  );
}

export function ConfidenceMeter({ value }: { value: number }) {
  const percent = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-1.5 w-12 overflow-hidden rounded-full bg-neutral-200"
        role="presentation"
      >
        <span
          className={cn(
            "block h-full",
            percent >= 75
              ? "bg-green-500"
              : percent >= 50
                ? "bg-amber-500"
                : "bg-red-500",
          )}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="text-xs text-neutral-500 tabular-nums">{percent}%</span>
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
      <span className="mb-1 block text-xs font-medium text-neutral-600">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs text-neutral-400 text-pretty">
          {hint}
        </span>
      )}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm placeholder:text-neutral-400 focus:border-blue-500 focus:outline-2 focus:outline-blue-500/30";

export const buttonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50";

export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50";

export const dangerButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50";
