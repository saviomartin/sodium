"use client";

import { useState } from "react";
import { ToolDetailsDialog, type ToolDetail } from "./tool-details-dialog";
import { ConfirmationBadge, EmptyState, RateMeter, RiskBadge, cn } from "./ui";
import { ArrowRightIcon, WrenchIcon } from "./icons";

const number = new Intl.NumberFormat("en-US");

function formatLatency(value: number | null): string {
  if (value === null) return "—";
  return value < 1_000
    ? `${number.format(value)} ms`
    : `${(value / 1_000).toFixed(1)} s`;
}

/**
 * One row per tool in the deployed contract: what it is, where it runs, and
 * what happened when agents called it.
 *
 * The name is the affordance. Everything a contract declares that will not fit
 * in a row — the input schema, the route conditions, the output — is one click
 * away in the details panel rather than truncated into a column.
 */
export function ToolTable({ tools }: { tools: ToolDetail[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Open state is tracked apart from the selection: the selected id outlives
  // the close so the panel still has a tool to render as it fades out.
  const [open, setOpen] = useState(false);
  const selected = tools.find((tool) => tool.id === selectedId) ?? null;

  if (tools.length === 0) {
    return (
      <EmptyState
        icon={WrenchIcon}
        title="No tools deployed yet"
        hint={
          <>
            Run{" "}
            <code className="text-neutral-200">npx sodiumtools deploy</code> in
            your app to publish the tools declared in sodium.json.
          </>
        }
      />
    );
  }

  return (
    <div>
      {/* A declared minimum keeps the six columns at readable widths and makes
          the container genuinely scroll instead of crushing them; without it
          the tool column absorbs the width and pushes the measurements — the
          point of this table — off-screen on a phone. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-neutral-400">
              <th className="px-4 py-2.5 font-medium">Tool</th>
              <th className="px-4 py-2.5 font-medium">Where</th>
              <th className="px-4 py-2.5 font-medium">Risk</th>
              <th className="px-4 py-2.5 font-medium">Confirmation</th>
              <th className="px-4 py-2.5 text-right font-medium">Calls</th>
              <th className="px-4 py-2.5 font-medium">Success</th>
              <th className="px-4 py-2.5 text-right font-medium">P95</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.07]">
            {tools.map((tool) => {
              const routes = tool.routes
                .map((route) => route.pattern)
                .join(", ");
              return (
                <tr
                  key={tool.id}
                  className="align-middle transition-colors hover:bg-white/[0.025]"
                >
                  <td className="max-w-xs px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(tool.id);
                        setOpen(true);
                      }}
                      className="group inline-flex items-center gap-1 rounded-sm py-0.5 text-left font-medium text-blue-400 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                    >
                      {tool.title}
                      <ArrowRightIcon
                        aria-hidden
                        weight="bold"
                        className="size-3.5 shrink-0 opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
                      />
                    </button>
                    <p className="font-mono text-xs text-faint">{tool.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-neutral-400 text-pretty">
                      {tool.description}
                    </p>
                  </td>
                  <td className="max-w-48 px-4 py-3">
                    <p
                      className="line-clamp-2 font-mono text-xs text-neutral-300"
                      title={routes}
                    >
                      {routes}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <RiskBadge risk={tool.risk} />
                  </td>
                  <td className="px-4 py-3">
                    <ConfirmationBadge policy={tool.confirmation} />
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right tabular-nums",
                      tool.stats.calls ? "text-neutral-100" : "text-faint",
                    )}
                  >
                    {number.format(tool.stats.calls)}
                  </td>
                  <td className="px-4 py-3">
                    <RateMeter value={tool.stats.successRate} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-300">
                    {formatLatency(tool.stats.p95Ms)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ToolDetailsDialog
        tool={selected}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
