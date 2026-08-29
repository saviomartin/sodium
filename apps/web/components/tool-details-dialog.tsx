"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type {
  ActionContract,
  ConfirmationPolicy,
  ContractIssue,
  RiskLevel,
} from "@sodium/contracts";
import type { CandidateEvalRun } from "@/lib/queries";
import { Card, ConfidenceMeter, RiskBadge, secondaryButtonClass } from "./ui";

const confirmationLabels: Record<ConfirmationPolicy, string> = {
  none: "No confirmation — read-only execution",
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
        <Dialog.Overlay className="fixed inset-0 z-40 bg-neutral-900/40" />
        {tool ? (
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(64rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 p-5 shadow-lg focus:outline-none">
            <header className="relative pr-20">
              <div className="flex flex-wrap items-center gap-2">
                <Dialog.Title className="text-lg font-semibold text-balance">
                  {tool.title}
                </Dialog.Title>
                <span
                  className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${
                    available
                      ? "bg-green-50 text-green-700"
                      : "bg-neutral-200 text-neutral-600"
                  }`}
                >
                  {available ? "available" : "disabled"}
                </span>
                <RiskBadge risk={tool.riskLevel} />
              </div>
              <Dialog.Description className="sr-only">
                Details and source evidence for {tool.title}
              </Dialog.Description>
              <p className="mt-1 font-mono text-xs text-neutral-500">
                {tool.name} · {tool.actionId}
                {tool.contract
                  ? ` · contract v${tool.contract.contractVersion}`
                  : " · invalid contract"}
              </p>
              <Dialog.Close
                type="button"
                className={`${secondaryButtonClass} absolute top-0 right-0`}
              >
                Close
              </Dialog.Close>
            </header>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div className="space-y-5">
                <Card title="What it does">
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-xs font-medium text-neutral-500">
                        Description
                      </dt>
                      <dd className="text-pretty">{tool.description}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-neutral-500">
                        Confirmation
                      </dt>
                      <dd>{confirmationLabels[tool.confirmation]}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-neutral-500">
                        Confidence
                      </dt>
                      <dd>
                        <ConfidenceMeter value={tool.confidence} />
                      </dd>
                    </div>
                  </dl>
                </Card>

                <Card title="Input & output">
                  {tool.contract ? (
                    <div className="space-y-3">
                      <div>
                        <p className="mb-1 text-xs font-medium text-neutral-500">
                          Input schema
                        </p>
                        <pre className="overflow-x-auto rounded bg-neutral-100 p-3 text-xs">
                          {JSON.stringify(tool.contract.inputSchema, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium text-neutral-500">
                          Output schema
                        </p>
                        {tool.contract.output.schema ? (
                          <pre className="overflow-x-auto rounded bg-neutral-100 p-3 text-xs">
                            {JSON.stringify(
                              tool.contract.output.schema,
                              null,
                              2,
                            )}
                          </pre>
                        ) : (
                          <p className="text-sm text-amber-700">
                            No machine-checkable output schema is attached.
                          </p>
                        )}
                        <p className="mt-1 text-xs text-neutral-500 text-pretty">
                          {tool.contract.output.description}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-red-700">
                      This candidate does not contain a valid v2 contract.
                    </p>
                  )}
                </Card>

                <Card title="Handler & authorization">
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-xs font-medium text-neutral-500">
                        Handler
                      </dt>
                      <dd>
                        <pre className="mt-1 overflow-x-auto rounded bg-neutral-100 p-3 text-xs">
                          {JSON.stringify(
                            tool.contract?.handler ?? {},
                            null,
                            2,
                          )}
                        </pre>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-neutral-500">
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
                      <dt className="text-xs font-medium text-neutral-500">
                        Authentication
                      </dt>
                      <dd className="text-pretty">
                        {tool.contract?.auth.required
                          ? `Required${tool.contract.auth.roles.length ? ` — roles: ${tool.contract.auth.roles.join(", ")}` : ""}. The application still enforces access at execution time.`
                          : "No authentication requirement was detected in the cited source. The application still enforces runtime access."}
                      </dd>
                      {tool.contract?.auth.detectedFrom ? (
                        <dd className="mt-1 text-xs text-neutral-500 text-pretty">
                          Detected from: {tool.contract.auth.detectedFrom}
                        </dd>
                      ) : null}
                    </div>
                  </dl>
                </Card>
              </div>

              <div className="space-y-5">
                <Card title="Validation & evaluations">
                  <div className="space-y-3">
                    <p className="text-sm text-neutral-500">
                      {tool.issues.length === 0
                        ? "Contract validation passed with no issues."
                        : `${tool.issues.length} contract validation issue${tool.issues.length === 1 ? "" : "s"}.`}
                    </p>
                    {tool.issues.length > 0 ? (
                      <ul className="space-y-2 text-sm">
                        {tool.issues.map((issue, index) => (
                          <li key={`issue-${index}`} className="flex gap-2">
                            <span
                              className={
                                issue.severity === "error"
                                  ? "text-red-700"
                                  : "text-amber-700"
                              }
                            >
                              {issue.severity}
                            </span>
                            <span className="text-pretty">
                              <span className="font-mono text-xs">
                                {issue.code}
                              </span>{" "}
                              — {issue.message}
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
                              className={
                                evalRun.passed
                                  ? "text-green-700"
                                  : "text-amber-700"
                              }
                            >
                              {evalRun.passed ? "pass" : "fail"}
                            </span>
                            <span className="text-pretty">
                              <span className="font-mono text-xs">
                                {evalRun.name}
                              </span>{" "}
                              —{" "}
                              {(evalRun.details as { details?: string } | null)
                                ?.details ?? "No details provided."}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-amber-700">
                        No evaluation results were recorded for this candidate.
                      </p>
                    )}
                  </div>
                </Card>

                <Card title="Source evidence">
                  {!tool.contract || tool.contract.evidence.length === 0 ? (
                    <p className="text-sm text-neutral-500">
                      No evidence attached.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {tool.contract.evidence.map((evidence, index) => (
                        <li key={index} className="text-sm">
                          {evidence.kind === "source" ? (
                            <details>
                              <summary className="cursor-pointer">
                                <span className="font-mono text-xs">
                                  {evidence.filePath}:{evidence.startLine}–
                                  {evidence.endLine}
                                </span>{" "}
                                <span className="text-neutral-500">
                                  ({evidence.primitive.replace("_", " ")})
                                </span>
                              </summary>
                              <p className="mt-2 text-xs text-neutral-500 text-pretty">
                                {evidence.summary} · SHA-256{" "}
                                {evidence.snippetSha256}
                              </p>
                              <pre className="mt-2 max-h-64 overflow-auto rounded bg-neutral-100 p-3 text-xs">
                                {evidence.excerpt}
                              </pre>
                            </details>
                          ) : evidence.kind === "crawl" ? (
                            <p className="text-pretty">
                              <span className="font-medium">Preview crawl</span>{" "}
                              — {evidence.summary}{" "}
                              <span className="font-mono text-xs">
                                {evidence.url}
                              </span>
                            </p>
                          ) : (
                            <p className="text-pretty">
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
