"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RiskLevel } from "@sodium/contracts";
import { setCandidatesEnabledAction } from "@/lib/actions";
import { trackProductEvent } from "@/lib/product-analytics";
import { ConfidenceMeter, RiskBadge, cn } from "./ui";
import { useRepositorySettingsState } from "./repository-settings-state";
import { ToolDetailsDialog, type ToolDetail } from "./tool-details-dialog";

export interface CandidateRow {
  id: string;
  action_id: string;
  name: string;
  title: string;
  description: string;
  risk_level: RiskLevel;
  confidence: number;
  status: string;
  scopePaths: string[];
  detail: ToolDetail;
  enabled: boolean;
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

/** One decision surface: inspect details or stage tool availability changes. */
export function ReviewTable({
  candidates,
  siteId,
  locked = false,
}: {
  candidates: CandidateRow[];
  siteId: string;
  locked?: boolean;
}) {
  const router = useRouter();
  const { beginEdit, endEdit } = useRepositorySettingsState();
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      candidates.map((candidate) => [candidate.id, candidate.enabled]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const actionable = candidates.filter(
    (candidate) => candidate.status !== "rejected",
  );
  const enabledCount = actionable.filter(
    (candidate) => enabled[candidate.id],
  ).length;
  const allEnabled =
    actionable.length > 0 && enabledCount === actionable.length;
  const selectedCandidate =
    candidates.find((candidate) => candidate.id === selectedCandidateId) ??
    null;

  function update(candidateIds: string[], nextEnabled: boolean) {
    const previous = { ...enabled };
    setError(null);
    setEnabled((current) => ({
      ...current,
      ...Object.fromEntries(candidateIds.map((id) => [id, nextEnabled])),
    }));
    beginEdit();
    startTransition(async () => {
      try {
        const result = await setCandidatesEnabledAction(
          candidateIds,
          siteId,
          nextEnabled,
        );
        if (!result.ok) {
          setEnabled(previous);
          setError(result.error ?? "Tool availability could not be updated.");
          return;
        }
        trackProductEvent({
          name: "Tool Availability Updated",
          properties: {
            enabled: nextEnabled,
            scope: candidateIds.length === 1 ? "single" : "all",
          },
        });
        router.refresh();
      } finally {
        endEdit();
      }
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-neutral-500 text-pretty">
          {locked
            ? "Subscribe to enable, edit, and publish these generated tools."
            : "All tools start disabled. Republish after changing your selection."}
        </p>
        <span className="text-xs text-neutral-500 tabular-nums">
          {enabledCount} of {actionable.length} available tools enabled
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
              <th className="py-2 pr-4 font-medium">Scope</th>
              <th className="py-2 pr-4 font-medium">Risk</th>
              <th className="py-2 pr-4 font-medium">Confidence</th>
              <th className="py-2 text-right font-medium">
                <span className="inline-flex items-center gap-2">
                  Enable all
                  <Toggle
                    checked={allEnabled}
                    disabled={locked || pending || actionable.length === 0}
                    label={
                      allEnabled ? "Disable all tools" : "Enable all tools"
                    }
                    onChange={(checked) =>
                      update(
                        actionable.map((candidate) => candidate.id),
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
              const scopeLabel = candidate.scopePaths.join(", ");
              return (
                <tr key={candidate.id} className="align-middle">
                  <td className="max-w-xl py-3 pr-4">
                    <button
                      type="button"
                      onClick={() => setSelectedCandidateId(candidate.id)}
                      className="rounded-sm text-left font-medium text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      {candidate.title}
                    </button>
                    <p className="font-mono text-xs text-neutral-400">
                      {candidate.name}
                    </p>
                    {candidate.status === "rejected" ? (
                      <p className="mt-1 text-xs font-medium text-red-700">
                        Validation failed — open details
                      </p>
                    ) : null}
                    <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500 text-pretty">
                      {candidate.description}
                    </p>
                  </td>
                  <td className="max-w-56 py-3 pr-4">
                    <p
                      className="line-clamp-2 font-mono text-xs text-neutral-700"
                      title={scopeLabel || undefined}
                    >
                      {scopeLabel || "Scope unavailable"}
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
                      disabled={
                        locked || pending || candidate.status === "rejected"
                      }
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

      <ToolDetailsDialog
        tool={selectedCandidate?.detail ?? null}
        available={
          selectedCandidate ? Boolean(enabled[selectedCandidate.id]) : false
        }
        open={selectedCandidate !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCandidateId(null);
        }}
      />
    </div>
  );
}
