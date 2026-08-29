"use client";

import Link from "next/link";
import { Card, buttonClass, secondaryButtonClass } from "@/components/ui";
import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  WarningIcon,
  WarningCircleIcon,
} from "@/components/icons";

export default function RepositoryError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card title="Repository data could not be loaded" icon={WarningIcon}>
      <p
        role="alert"
        className="flex items-start gap-2 text-sm text-neutral-400 text-pretty"
      >
        <WarningCircleIcon
          aria-hidden
          weight="fill"
          className="mt-0.5 size-4 shrink-0 text-amber-300"
        />
        Your repository is still connected. The dashboard could not read its
        latest analysis or tool settings.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={reset} className={buttonClass}>
          <ArrowClockwiseIcon
            aria-hidden
            weight="bold"
            className="size-4 shrink-0 transition-transform duration-300 group-hover:rotate-180 motion-reduce:transition-none"
          />
          Try again
        </button>
        <Link href="/" className={secondaryButtonClass}>
          <ArrowLeftIcon
            aria-hidden
            weight="bold"
            className="size-4 shrink-0 transition-transform duration-150 group-hover:-translate-x-0.5 motion-reduce:transition-none"
          />
          Back to repositories
        </Link>
      </div>
    </Card>
  );
}
