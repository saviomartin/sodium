"use client";

import Link from "next/link";
import { Card, buttonClass, secondaryButtonClass } from "@/components/ui";

export default function RepositoryError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card title="Repository data could not be loaded">
      <p role="alert" className="text-sm text-neutral-600 text-pretty">
        Your repository is still connected. The dashboard could not read its
        latest analysis or tool settings.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={reset} className={buttonClass}>
          Try again
        </button>
        <Link href="/" className={secondaryButtonClass}>
          Back to repositories
        </Link>
      </div>
    </Card>
  );
}
