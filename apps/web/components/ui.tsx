import type { ComponentType, ReactNode } from "react";
import { ArrowRightIcon } from "./icons";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export const frameClass = "frame";
export const buttonClass =
  "group inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-950 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50";
export const heroButtonClass = buttonClass;
export const secondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-neutral-100 transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50";

export function CtaArrow() {
  return <ArrowRightIcon aria-hidden className="size-4" weight="bold" />;
}

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export function Card({
  title,
  icon: IconComponent,
  actions,
  children,
}: {
  title?: string;
  icon?: Icon;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={cn(frameClass, "min-w-0")}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-3">
          {title ? (
            <h2 className="flex items-center gap-2 text-sm font-medium text-neutral-100">
              {IconComponent && (
                <IconComponent
                  aria-hidden
                  className="size-4 text-neutral-500"
                />
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
