"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type {
  ActionContract,
  ConfirmationPolicy,
  ContractIssue,
  RiskLevel,
} from "@sodium/contracts";
import type { CandidateEvalRun } from "@/lib/queries";
import {
  Card,
  ConfidenceMeter,
  frameClass,
  RiskBadge,
  secondaryButtonClass,
} from "./ui";
import {
  CheckCircleIcon,
  CodeIcon,
  FileCodeIcon,
  FlaskIcon,
  GlobeIcon,
  InfoIcon,
  KeyIcon,
  ListChecksIcon,
  MagnifyingGlassIcon,
  ProhibitIcon,
  WarningIcon,
  WarningCircleIcon,
  XIcon,
  XCircleIcon,
} from "./icons";

const confirmationLabels: Record<ConfirmationPolicy, string> = {
  none: "No confirmation, read-only execution",
  recommended: "Confirmation recommended before execution",
  required: "Confirmation required and enforced by the loader",
};

export interface ToolDetail {
  actionId: string;
  name: string;
  title: string;
  description: string;
  riskLevel: RiskLevel;
  confirmation: ConfirmationPolicy;
  confidence: number;
  contract: ActionContract | null;
  issues: ContractIssue[];
  evals: CandidateEvalRun[];
}

export function ToolDetailsDialog({
  tool,
  available,
  open,
  onOpenChange,
}: {
  tool: ToolDetail | null;
  available: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-fade fixed inset-0 z-40 bg-ink-950/70 backdrop-blur-sm" />
        {tool ? (
          <Dialog.Content
            className={`modal-fade fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(64rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5 shadow-lg shadow-black/40 focus:outline-none ${frameClass}`}
          >
            {/* Reserves the Close button's own width, which the icon and label
                push just past `pr-20`. */}
            <header className="relative pr-24">
              <div className="flex flex-wrap items-center gap-2">
                <Dialog.Title className="text-lg font-medium text-balance">
                  {tool.title}
                </Dialog.Title>
                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${
                    available
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-white/10 text-neutral-400"
                  }`}
                >
                  {available ? (
                    <CheckCircleIcon
                      aria-hidden
                      weight="fill"
                      className="size-3.5"
                    />
                  ) : (
                    <ProhibitIcon
                      aria-hidden
                      weight="bold"
                      className="size-3.5"
                    />
                  )}
                  {available ? "available" : "disabled"}
                </span>
                <RiskBadge risk={tool.riskLevel} />
              </div>
              <Dialog.Description className="sr-only">
                Details and source evidence for {tool.title}
              </Dialog.Description>
              <p className="mt-1 font-mono text-xs text-neutral-400">
                {tool.name} · {tool.actionId}
                {tool.contract
                  ? ` · contract v${tool.contract.contractVersion}`
                  : " · invalid contract"}
              </p>
              <Dialog.Close
                type="button"
                className={`${secondaryButtonClass} absolute top-0 right-0`}
              >
                <XIcon aria-hidden weight="bold" className="size-4 shrink-0" />
                Close
              </Dialog.Close>
            </header>

            {/* `min-w-0` on each column: the schema and handler blocks below
                scroll on their own, but as grid items their automatic minimum
                size is that JSON's min-content — without it the columns hold
                the dialog open and the overflow is clipped unreachably. */}
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div className="min-w-0 space-y-5">
                <Card title="What it does" icon={InfoIcon}>
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-xs font-medium text-neutral-400">
                        Description
                      </dt>
                      <dd className="text-pretty">{tool.description}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-neutral-400">
                        Confirmation
                      </dt>
                      <dd>{confirmationLabels[tool.confirmation]}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-neutral-400">
                        Confidence
                      </dt>
                      <dd>
                        <ConfidenceMeter value={tool.confidence} />
                      </dd>
                    </div>
                  </dl>
                </Card>

                <Card title="Input & output" icon={CodeIcon}>
                  {tool.contract ? (
                    <div className="space-y-3">
                      <div>
                        <p className="mb-1 text-xs font-medium text-neutral-400">
                          Input schema
                        </p>
                        <pre className="overflow-x-auto rounded bg-white/[0.06] p-3 font-mono text-xs">
                          {JSON.stringify(tool.contract.inputSchema, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium text-neutral-400">
                          Output schema
                        </p>
                        {tool.contract.output.schema ? (
                          <pre className="overflow-x-auto rounded bg-white/[0.06] p-3 font-mono text-xs">
                            {JSON.stringify(
                              tool.contract.output.schema,
                              null,
                              2,
                            )}
                          </pre>
                        ) : (
                          <p className="flex items-center gap-1.5 text-sm text-amber-300">
                            <WarningCircleIcon
                              aria-hidden
                              weight="fill"
                              className="size-4 shrink-0"
                            />
                            No machine-checkable output schema is attached.
                          </p>
                        )}
                        <p className="mt-1 text-xs text-neutral-400 text-pretty">
                          {tool.contract.output.description}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="flex items-center gap-1.5 text-sm text-red-400">
                      <XCircleIcon
                        aria-hidden
                        weight="fill"
                        className="size-4 shrink-0"
                      />
                      This candidate does not contain a valid v2 contract.
                    </p>
                  )}
                </Card>

                <Card title="Handler & authorization" icon={KeyIcon}>
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-xs font-medium text-neutral-400">
                        Handler
                      </dt>
                      <dd>
                        <pre className="mt-1 overflow-x-auto rounded bg-white/[0.06] p-3 font-mono text-xs">
                          {JSON.stringify(
                            tool.contract?.handler ?? {},
                            null,
                            2,
                          )}
                        </pre>
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs font-medium text-neutral-400">
                        <GlobeIcon aria-hidden className="size-3.5" />
                        Available on
                      </dt>
                      <dd className="font-mono text-xs">
                        {tool.contract?.routes
                          .map(
                            (route) =>
                              route.pathPattern +
                              (route.requiresSelector
                                ? ` (requires ${route.requiresSelector})`
                                : ""),
                          )
                          .join(", ")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-neutral-400">
                        Authentication
                      </dt>
                      <dd className="text-pretty">
                        {tool.contract?.auth.required
                          ? `Required${tool.contract.auth.roles.length ? `, roles: ${tool.contract.auth.roles.join(", ")}` : ""}. The application still enforces access at execution time.`
                          : "No authentication requirement was detected in the cited source. The application still enforces runtime access."}
                      </dd>
                      {tool.contract?.auth.detectedFrom ? (
                        <dd className="mt-1 text-xs text-neutral-400 text-pretty">
                          Detected from: {tool.contract.auth.detectedFrom}
                        </dd>
                      ) : null}
                    </div>
                  </dl>
                </Card>
              </div>

              <div className="min-w-0 space-y-5">
                <Card title="Validation & evaluations" icon={ListChecksIcon}>
                  <div className="space-y-3">
                    <p className="text-sm text-neutral-400">
                      {tool.issues.length === 0
                        ? "Contract validation passed with no issues."
                        : `${tool.issues.length} contract validation issue${tool.issues.length === 1 ? "" : "s"}.`}
                    </p>
                    {tool.issues.length > 0 ? (
                      <ul className="space-y-2 text-sm">
                        {tool.issues.map((issue, index) => (
                          <li key={`issue-${index}`} className="flex gap-2">
                            <span
                              className={`inline-flex shrink-0 items-center gap-1 ${
                                issue.severity === "error"
                                  ? "text-red-400"
                                  : "text-amber-300"
                              }`}
                            >
                              {issue.severity === "error" ? (
                                <XCircleIcon
                                  aria-hidden
                                  weight="fill"
                                  className="size-4"
                                />
                              ) : (
                                <WarningIcon
                                  aria-hidden
                                  weight="fill"
                                  className="size-4"
                                />
                              )}
                              {issue.severity}
                            </span>
                            <span className="text-pretty">
                              <span className="font-mono text-xs">
                                {issue.code}
                              </span>
                              : {issue.message}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {tool.evals.length > 0 ? (
                      <ul className="space-y-2 text-sm">
                        {tool.evals.map((evalRun, index) => (
                          <li key={`eval-${index}`} className="flex gap-2">
                            <span
                              className={`inline-flex shrink-0 items-center gap-1 ${
                                evalRun.passed
                                  ? "text-emerald-400"
                                  : "text-amber-300"
                              }`}
                            >
                              {evalRun.passed ? (
                                <CheckCircleIcon
                                  aria-hidden
                                  weight="fill"
                                  className="size-4"
                                />
                              ) : (
                                <WarningIcon
                                  aria-hidden
                                  weight="fill"
                                  className="size-4"
                                />
                              )}
                              {evalRun.passed ? "pass" : "fail"}
                            </span>
                            <span className="text-pretty">
                              <span className="font-mono text-xs">
                                {evalRun.name}
                              </span>
                              :{" "}
                              {(evalRun.details as { details?: string } | null)
                                ?.details ?? "No details provided."}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="flex items-center gap-1.5 text-sm text-amber-300">
                        <WarningCircleIcon
                          aria-hidden
                          weight="fill"
                          className="size-4 shrink-0"
                        />
                        No evaluation results were recorded for this candidate.
                      </p>
                    )}
                  </div>
                </Card>

                <Card title="Source evidence" icon={MagnifyingGlassIcon}>
                  {!tool.contract || tool.contract.evidence.length === 0 ? (
                    <p className="text-sm text-neutral-400">
                      No evidence attached.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {tool.contract.evidence.map((evidence, index) => (
                        <li key={index} className="text-sm">
                          {evidence.kind === "source" ? (
                            <details>
                              <summary className="flex cursor-pointer items-center gap-1.5">
                                <FileCodeIcon
                                  aria-hidden
                                  className="size-3.5 shrink-0 text-faint"
                                />
                                <span className="font-mono text-xs">
                                  {evidence.filePath}:{evidence.startLine}–
                                  {evidence.endLine}
                                </span>{" "}
                                <span className="text-neutral-400">
                                  ({evidence.primitive.replace("_", " ")})
                                </span>
                              </summary>
                              <p className="mt-2 text-xs text-neutral-400 text-pretty">
                                {evidence.summary} · SHA-256{" "}
                                {evidence.snippetSha256}
                              </p>
                              <pre className="mt-2 max-h-64 overflow-auto rounded bg-white/[0.06] p-3 font-mono text-xs">
                                {evidence.excerpt}
                              </pre>
                            </details>
                          ) : evidence.kind === "crawl" ? (
                            <p className="text-pretty">
                              <GlobeIcon
                                aria-hidden
                                className="mr-1 inline size-3.5 align-[-2px] text-faint"
                              />
                              <span className="font-medium">Preview crawl</span>
                              : {evidence.summary}{" "}
                              <span className="font-mono text-xs">
                                {evidence.url}
                              </span>
                            </p>
                          ) : (
                            <p className="text-pretty">
                              <FlaskIcon
                                aria-hidden
                                className="mr-1 inline size-3.5 align-[-2px] text-faint"
                              />
                              <span className="font-medium">Eval</span>{" "}
                              {evidence.evalName}: {evidence.details}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </div>
          </Dialog.Content>
        ) : null}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
