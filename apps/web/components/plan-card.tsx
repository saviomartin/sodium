import type { ReactNode } from "react";
import { CheckIcon } from "@/components/icons";
import { cn, frameClass } from "@/components/ui";

/**
 * One pricing card, in the one place both surfaces read it from.
 *
 * The home page shows these side by side and the repository page shows the
 * paid one inside its unlock dialog. Sharing the component — not just the
 * feature list — is what keeps the price, the ticks, and the call to action
 * identical wherever a visitor meets them.
 */
export function PlanCard({
  name,
  price,
  cadence,
  features,
  action,
  framed = true,
}: {
  /** Names the plan for assistive tech; the headline shows price or name. */
  name: string;
  /** Omitted by a plan that is quoted rather than bought. */
  price?: string;
  cadence?: string;
  features: readonly string[];
  action: ReactNode;
  /** Off inside a surface that already draws the frame, like the dialog. */
  framed?: boolean;
}) {
  return (
    <div
      className={cn("flex min-w-0 flex-col", framed && cn(frameClass, "p-6"))}
    >
      {/* `min-h-10` is the headline's line box: a priced card and a quoted one
          keep the same band, so their bodies start on the same line. */}
      <h3 className="flex min-h-10 items-end gap-2">
        <span className="sr-only">{name}: </span>
        {price ? (
          <>
            <span className="text-[40px] leading-none font-medium tabular-nums text-neutral-100">
              {price}
            </span>
            {cadence && (
              <span className="text-sm text-neutral-400">{cadence}</span>
            )}
          </>
        ) : (
          <span
            aria-hidden
            className="text-[34px] leading-none font-medium text-neutral-100"
          >
            {name}
          </span>
        )}
      </h3>
      <ul className="mt-6 space-y-2.5">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm">
            <CheckIcon
              aria-hidden
              weight="bold"
              className="mt-1 size-3.5 shrink-0 text-emerald-400"
            />
            <span className="text-neutral-300 text-pretty">{feature}</span>
          </li>
        ))}
      </ul>
      {/* `mt-auto`: the cards stretch to a common height, so pushing the
          action to the bottom lines both up on one row. The child selectors
          size whatever a caller passes — a link here, a form's submit button
          in the dialog — to one full-width, comfortably readable button. */}
      <div className="mt-auto pt-8 [&_a]:min-h-12 [&_a]:w-full [&_a]:text-base [&_button]:min-h-12 [&_button]:w-full [&_button]:text-base">
        {action}
      </div>
    </div>
  );
}
