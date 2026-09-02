"use client";

import { useEffect, useRef } from "react";
import { trackProductEvent } from "@/lib/product-analytics";
import { CopyButton } from "./code-snippet";
import { JsonCode } from "./json-code";
import {
  Card,
  ConfirmationBadge,
  RateMeter,
  RiskBadge,
  cn,
  frameClass,
  secondaryButtonClass,
} from "./ui";
import {
  BracketsCurlyIcon,
  CursorClickIcon,
  InfoIcon,
  PulseIcon,
  SignpostIcon,
  XIcon,
} from "./icons";

/** Everything the dashboard can say about one deployed tool. */
export interface ToolDetail {
  id: string;
  name: string;
  title: string;
  description: string;
  risk: string;
  confirmation: string;
  /** Route patterns the tool is registered on, with any selector condition. */
  routes: { pattern: string; when?: string }[];
  /** How the tool does its work, named the way `sodium.json` names it. */
  run: { kind: string; summary: string };
  input: unknown;
  output: { description: string; schema?: unknown } | null;
  stats: {
    calls: number;
    successes: number;
    failures: number;
    denied: number;
    successRate: number | null;
    p95Ms: number | null;
  };
}

const number = new Intl.NumberFormat("en-US");

function formatLatency(value: number | null): string {
  if (value === null) return "—";
  return value < 1_000
    ? `${number.format(value)} ms`
    : `${(value / 1_000).toFixed(1)} s`;
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-400">{label}</dt>
      <dd className="mt-0.5 text-pretty">{children}</dd>
    </div>
  );
}

/** A labelled JSON block with its own copy button. */
function SchemaBlock({ label, value }: { label: string; value: unknown }) {
  const json = JSON.stringify(value, null, 2);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-neutral-400">{label}</p>
        <CopyButton value={json} label={`Copy ${label.toLowerCase()}`} />
      </div>
      <div className="max-h-64 overflow-auto rounded bg-black/25">
        <JsonCode snippet={json} />
      </div>
    </div>
  );
}

export function ToolDetailsDialog({
  tool,
  open,
  onClose,
}: {
  /** Outlives `open` by one animation, so the panel has content while it fades. */
  tool: ToolDetail | null;
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  // `showModal()` is what puts the element in the top layer and gives it the
  // focus trap and Escape handling for free, so open state is driven into the
  // DOM rather than rendered as a class.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  useEffect(() => {
    if (open && tool) trackProductEvent({ name: "Tool Details Opened" });
  }, [open, tool]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="tool-details-title"
      onClose={onClose}
      onClick={(event) => {
        // The backdrop is the dialog's own box outside its content, so a click
        // that lands on the element itself is a click outside the panel.
        if (event.currentTarget === event.target) event.currentTarget.close();
      }}
      className="modal m-auto max-h-[calc(100dvh-2rem)] w-[min(64rem,calc(100vw-2rem))] overflow-y-auto bg-transparent p-0 text-neutral-200"
    >
      {tool && (
        <div className={cn(frameClass, "p-5")}>
          {/* Reserves the Close button's own width, which the icon and label
              push just past `pr-20`. */}
          <header className="relative pr-24">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="tool-details-title"
                className="text-lg font-medium text-balance"
              >
                {tool.title}
              </h2>
              <RiskBadge risk={tool.risk} />
              <ConfirmationBadge policy={tool.confirmation} />
            </div>
            <p className="mt-1 font-mono text-xs text-neutral-400">
              {tool.name} · {tool.id}
            </p>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className={cn(secondaryButtonClass, "absolute top-0 right-0")}
            >
              <XIcon aria-hidden weight="bold" className="size-4 shrink-0" />
              Close
            </button>
          </header>

          {/* `min-w-0` on each column: the schema blocks scroll on their own,
              but as grid items their automatic minimum size is that JSON's
              min-content width, and without it the columns hold the dialog
              open and the overflow is clipped unreachably. */}
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="min-w-0 space-y-4">
              <Card title="What it does" icon={InfoIcon}>
                <dl className="space-y-3 text-sm">
                  <Term label="Description">{tool.description}</Term>
                  <Term label="How it runs">
                    <span className="font-mono text-xs text-blue-300">
                      {tool.run.kind}
                    </span>{" "}
                    <span className="text-neutral-300">{tool.run.summary}</span>
                  </Term>
                  <Term label="Confirmation">
                    {tool.confirmation === "required"
                      ? "The browser must confirm with the user before this runs."
                      : tool.confirmation === "recommended"
                        ? "Confirmation is advised; the browser decides whether to prompt."
                        : "Runs without a prompt. Your app still enforces its own access rules."}
                  </Term>
                </dl>
              </Card>

              <Card title="Where it is available" icon={SignpostIcon}>
                <ul className="space-y-2 text-sm">
                  {tool.routes.map((route) => (
                    <li key={`${route.pattern}${route.when ?? ""}`}>
                      <code className="font-mono text-xs text-neutral-100">
                        {route.pattern}
                      </code>
                      {route.when && (
                        <span className="mt-0.5 block text-xs text-neutral-400 text-pretty">
                          only while{" "}
                          <code className="font-mono">{route.when}</code> is on
                          the page
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 border-t border-white/[0.07] pt-3 text-xs leading-5 text-faint text-pretty">
                  The SDK registers a tool only while the current route matches,
                  so agents never see a tool they cannot use.
                </p>
              </Card>

              <Card title="Measured behaviour" icon={PulseIcon}>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <Term label="Calls">
                    <span className="tabular-nums">
                      {number.format(tool.stats.calls)}
                    </span>
                  </Term>
                  <Term label="Success rate">
                    <RateMeter value={tool.stats.successRate} />
                  </Term>
                  <Term label="Failed">
                    <span className="tabular-nums">
                      {number.format(tool.stats.failures)}
                    </span>
                  </Term>
                  <Term label="Denied at the prompt">
                    <span className="tabular-nums">
                      {number.format(tool.stats.denied)}
                    </span>
                  </Term>
                  <Term label="P95 latency">
                    <span className="tabular-nums">
                      {formatLatency(tool.stats.p95Ms)}
                    </span>
                  </Term>
                </dl>
              </Card>
            </div>

            <div className="min-w-0 space-y-4">
              <Card title="Input schema" icon={BracketsCurlyIcon}>
                <SchemaBlock label="Input" value={tool.input} />
                <p className="mt-3 text-xs leading-5 text-faint text-pretty">
                  The JSON Schema agents see when they read this tool. Sodium
                  compiles it from the{" "}
                  <code className="font-mono text-neutral-300">input</code>{" "}
                  block in your sodium.json.
                </p>
              </Card>

              <Card title="Output" icon={CursorClickIcon}>
                {tool.output ? (
                  <div className="space-y-3">
                    <p className="text-sm text-neutral-300 text-pretty">
                      {tool.output.description}
                    </p>
                    {tool.output.schema ? (
                      <SchemaBlock label="Output" value={tool.output.schema} />
                    ) : (
                      <p className="text-sm text-neutral-400 text-pretty">
                        No machine-checkable output schema is declared, so
                        agents read the description above instead.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-400 text-pretty">
                    This tool declares no output. Agents treat a successful call
                    as the result.
                  </p>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
