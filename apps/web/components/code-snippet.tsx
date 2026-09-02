"use client";

import { useState } from "react";
import {
  trackProductEvent,
  type ProductAnalyticsEventName,
} from "@/lib/product-analytics";
import { cn, secondaryButtonClass } from "./ui";
import { CheckIcon, CopyIcon } from "./icons";

/**
 * The copy affordance shared by every snippet in the app.
 *
 * It reports success in place rather than through a toast: the button is
 * already where the eye is, and a toast for "copied" is noise on a page that
 * shows two commands at once.
 *
 * Two shapes for two jobs. Beside a schema label in a dialog it is a bare
 * glyph, because the reader is there to read the schema. On a command the
 * reader came to copy, it is a labelled button — an icon alone asks people to
 * guess, and guessing is a step too many on the one thing the page wants them
 * to do.
 */
export function CopyButton({
  value,
  label = "Copy",
  event,
  withLabel = false,
  className,
}: {
  value: string;
  /** The accessible name. Also the tooltip when the face is a bare glyph. */
  label?: string;
  /** What to record in product analytics, if this copy is worth knowing about. */
  event?: ProductAnalyticsEventName;
  /** Render as a full button with visible "Copy" text. */
  withLabel?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard unavailable; the text is on screen to select by hand.
      return;
    }
    setCopied(true);
    if (event) trackProductEvent({ name: event });
    setTimeout(() => setCopied(false), 1500);
  };

  const mark = copied ? (
    <CheckIcon
      aria-hidden
      weight="bold"
      className="size-4 shrink-0 text-emerald-400"
    />
  ) : (
    <CopyIcon aria-hidden className="size-4 shrink-0" />
  );

  if (withLabel) {
    return (
      <button
        type="button"
        aria-label={label}
        onClick={copy}
        className={cn(secondaryButtonClass, "shrink-0 px-2.5", className)}
      >
        {mark}
        <span className="w-fit">{copied ? "Copied" : "Copy"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      onClick={copy}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded text-faint transition-colors hover:bg-white/[0.08] hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500",
        className,
      )}
    >
      {/* Smaller than the labelled face: it sits beside 12px label text. */}
      <span className="[&>svg]:size-3.5">{mark}</span>
    </button>
  );
}
