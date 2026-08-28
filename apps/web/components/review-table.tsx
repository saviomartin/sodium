"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CandidateStatus, RiskLevel } from "@sodium/contracts";
import {
  CANDIDATE_STATUSES,
  RISK_LEVELS,
  RISK_LABELS,
} from "@sodium/contracts";
import { ConfidenceMeter, RiskBadge, StatusBadge, cn, inputClass } from "./ui";

export interface CandidateRow {
  id: string;
  name: string;
  title: string;
  description: string;
  risk_level: RiskLevel;
  confirmation: string;
  confidence: number;
  status: CandidateStatus;
  validation_issues: unknown;
  handlerKind: string;
  evalSummary: { passed: number; failed: number };
  repoId: string;
}

/**
 * The review table: quick decisions at a glance (purpose, inputs handled via
 * the handler column, effect, confidence, verification), filters for status
 * and risk, full evidence one click away on the detail page.
 */
export function ReviewTable({ candidates }: { candidates: CandidateRow[] }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string>("all");

  const filtered = useMemo(
    () =>
      candidates.filter(
        (candidate) =>
          (statusFilter === "all" || candidate.status === statusFilter) &&
          (riskFilter === "all" || candidate.risk_level === riskFilter),
      ),
    [candidates, statusFilter, riskFilter],
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-neutral-600">
          <span className="mb-1 block font-medium">Status</span>
          <select
            className={cn(inputClass, "w-40")}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            {CANDIDATE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-neutral-600">
          <span className="mb-1 block font-medium">Risk</span>
          <select
            className={cn(inputClass, "w-40")}
            value={riskFilter}
            onChange={(event) => setRiskFilter(event.target.value)}
          >
            <option value="all">All risk levels</option>
            {RISK_LEVELS.map((risk) => (
              <option key={risk} value={risk}>
                {RISK_LABELS[risk]}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-xs text-neutral-400 tabular-nums">
          {filtered.length} of {candidates.length} tools
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="py-2 pr-4 font-medium">Purpose</th>
              <th className="py-2 pr-4 font-medium">Effect</th>
              <th className="py-2 pr-4 font-medium">Handler</th>
              <th className="py-2 pr-4 font-medium">Confidence</th>
              <th className="py-2 pr-4 font-medium">Verification</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filtered.map((candidate) => {
              const issues = Array.isArray(candidate.validation_issues)
                ? candidate.validation_issues.length
                : 0;
              return (
                <tr key={candidate.id} className="align-top">
                  <td className="max-w-72 py-2 pr-4">
                    <Link
                      href={`/repos/${candidate.repoId}/candidates/${candidate.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {candidate.title}
                    </Link>
                    <p className="font-mono text-xs text-neutral-400">
                      {candidate.name}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">
                      {candidate.description}
                    </p>
                  </td>
                  <td className="py-2 pr-4">
                    <RiskBadge risk={candidate.risk_level} />
                    <p className="mt-1 text-xs text-neutral-400">
                      confirm: {candidate.confirmation}
                    </p>
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {candidate.handlerKind}
                  </td>
                  <td className="py-2 pr-4">
                    <ConfidenceMeter value={candidate.confidence} />
                  </td>
                  <td className="py-2 pr-4 text-xs tabular-nums">
                    {candidate.evalSummary.failed > 0 ? (
                      <span className="text-amber-700">
                        {candidate.evalSummary.failed} eval issue(s)
                      </span>
                    ) : candidate.evalSummary.passed > 0 ? (
                      <span className="text-green-700">
                        {candidate.evalSummary.passed} evals passed
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                    {issues > 0 && (
                      <p className="text-amber-700">
                        {issues} validation note(s)
                      </p>
                    )}
                  </td>
                  <td className="py-2">
                    <StatusBadge status={candidate.status} />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="py-8 text-center text-sm text-neutral-400"
                >
                  No tools match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
