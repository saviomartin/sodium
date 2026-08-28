"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { RiskLevel } from "@sodium/contracts";
import { setCandidatesEnabledAction } from "@/lib/actions";
import { ConfidenceMeter, RiskBadge, cn } from "./ui";

export interface CandidateRow {
  id: string;
  action_id: string;
  name: string;
  title: string;
  description: string;
  risk_level: RiskLevel;
  confidence: number;
  enabled: boolean;
  repoId: string;
}

function Toggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="relative inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-neutral-600 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        aria-label={label}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none relative h-5 w-9 rounded-full border",
          checked
            ? "border-blue-600 bg-blue-600"
            : "border-neutral-300 bg-neutral-200",
          "after:absolute after:left-0.5 after:top-0.5 after:size-3.5 after:rounded-full after:bg-white after:content-['']",
          checked && "after:translate-x-4",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-600",
        )}
      />
    </label>
  );
}

/** One decision surface: inspect details or make tools available immediately. */
export function ReviewTable({
  candidates,
  siteId,
}: {
  candidates: CandidateRow[];
  siteId: string;
}) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      candidates.map((candidate) => [candidate.id, candidate.enabled]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const enabledCount = candidates.filter((candidate) => enabled[candidate.id])
    .length;
  const allEnabled = enabledCount === candidates.length;

  function update(candidateIds: string[], nextEnabled: boolean) {
    const previous = { ...enabled };
    setError(null);
    setEnabled((current) => ({
      ...current,
      ...Object.fromEntries(candidateIds.map((id) => [id, nextEnabled])),
    }));
    startTransition(async () => {
      const result = await setCandidatesEnabledAction(
        candidateIds,
        siteId,
        nextEnabled,
      );
      if (!result.ok) {
        setEnabled(previous);
        setError(result.error ?? "Tool availability could not be updated.");
      }
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-neutral-500 text-pretty">
          All tools start disabled. Enabled tools are available immediately.
        </p>
        <span className="text-xs text-neutral-500 tabular-nums">
          {enabledCount} of {candidates.length} available
        </span>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 text-pretty"
        >
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="py-2 pr-4 font-medium">Tool</th>
              <th className="py-2 pr-4 font-medium">Risk</th>
              <th className="py-2 pr-4 font-medium">Confidence</th>
              <th className="py-2 text-right font-medium">
                <span className="inline-flex items-center gap-2">
                  Enable all
                  <Toggle
                    checked={allEnabled}
                    disabled={pending}
                    label={allEnabled ? "Disable all tools" : "Enable all tools"}
                    onChange={(checked) =>
                      update(
                        candidates.map((candidate) => candidate.id),
                        checked,
                      )
                    }
                  />
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {candidates.map((candidate) => {
              const isEnabled = Boolean(enabled[candidate.id]);
              return (
                <tr key={candidate.id} className="align-middle">
                  <td className="max-w-xl py-3 pr-4">
                    <Link
                      href={`/repos/${candidate.repoId}/candidates/${candidate.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {candidate.title}
                    </Link>
                    <p className="font-mono text-xs text-neutral-400">
                      {candidate.name}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500 text-pretty">
                      {candidate.description}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    <RiskBadge risk={candidate.risk_level} />
                  </td>
                  <td className="py-3 pr-4">
                    <ConfidenceMeter value={candidate.confidence} />
                  </td>
                  <td className="py-3 text-right">
                    <Toggle
                      checked={isEnabled}
                      disabled={pending}
                      label={`${isEnabled ? "Disable" : "Enable"} ${candidate.title}`}
                      onChange={(checked) => update([candidate.id], checked)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
