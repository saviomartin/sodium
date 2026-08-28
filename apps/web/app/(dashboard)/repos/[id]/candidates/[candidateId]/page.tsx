import Link from "next/link";
import { notFound } from "next/navigation";
import type {
  ActionContract,
  CandidateStatus,
  ContractIssue,
  RiskLevel,
} from "@sodium/contracts";
import { ActionContractSchema, RISK_LABELS } from "@sodium/contracts";
import {
  getCandidate,
  getEvalRuns,
  getRepository,
  getSiteForRepository,
} from "@/lib/queries";
import {
  approveCandidateAction,
  editCandidateAction,
  reviewCandidateAction,
} from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import {
  Card,
  ConfidenceMeter,
  Field,
  RiskBadge,
  StatusBadge,
  buttonClass,
  dangerButtonClass,
  inputClass,
  secondaryButtonClass,
} from "@/components/ui";

export const metadata = { title: "Tool detail" };

export default async function CandidatePage({
  params,
}: {
  params: Promise<{ id: string; candidateId: string }>;
}) {
  const { id, candidateId } = await params;
  const [repo, candidate, evals] = await Promise.all([
    getRepository(id),
    getCandidate(candidateId),
    getEvalRuns(candidateId),
  ]);
  if (!repo || !candidate) notFound();
  const site = await getSiteForRepository(repo.id);

  const parsedContract = ActionContractSchema.safeParse(candidate.contract);
  const contract: ActionContract | null = parsedContract.success
    ? parsedContract.data
    : null;
  const issues = (candidate.validation_issues ??
    []) as unknown as ContractIssue[];
  const status = candidate.status as CandidateStatus;
  const reviewable = status === "proposed" || status === "needs_review";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs text-neutral-400">
          <Link href={`/repos/${repo.id}`} className="hover:underline">
            {repo.full_name}
          </Link>{" "}
          / tool
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-balance">
            {candidate.title}
          </h1>
          <StatusBadge status={status} />
          <RiskBadge risk={candidate.risk_level as RiskLevel} />
        </div>
        <p className="mt-1 font-mono text-xs text-neutral-500">
          {candidate.name} · {candidate.action_id}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title="Contract">
            {reviewable ? (
              <ActionForm
                action={editCandidateAction}
                className="space-y-3"
                successMessage="Saved. Re-validated and marked needs review."
              >
                <input type="hidden" name="candidateId" value={candidate.id} />
                <Field label="Title">
                  <input
                    name="title"
                    defaultValue={candidate.title}
                    required
                    minLength={3}
                    maxLength={120}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Description"
                  hint="What agents read when deciding to use this tool. ≤ 500 characters recommended."
                >
                  <textarea
                    name="description"
                    defaultValue={candidate.description}
                    required
                    minLength={10}
                    maxLength={1024}
                    rows={3}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Confirmation policy"
                  hint={`Cannot go below the deterministic floor for ${RISK_LABELS[candidate.risk_level as RiskLevel]} actions.`}
                >
                  <select
                    name="confirmation"
                    defaultValue={candidate.confirmation}
                    className={inputClass}
                  >
                    <option value="none">none</option>
                    <option value="recommended">recommended</option>
                    <option value="required">required</option>
                  </select>
                </Field>
                <SubmitButton className={secondaryButtonClass}>
                  Save edits
                </SubmitButton>
              </ActionForm>
            ) : (
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs font-medium text-neutral-500">
                    Description
                  </dt>
                  <dd className="text-pretty">{candidate.description}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-neutral-500">
                    Confirmation
                  </dt>
                  <dd>{candidate.confirmation}</dd>
                </div>
              </dl>
            )}
          </Card>

          <Card title="Input schema">
            <pre className="overflow-x-auto rounded bg-neutral-50 p-3 text-xs">
              {JSON.stringify(contract?.inputSchema ?? {}, null, 2)}
            </pre>
            {contract?.output.description && (
              <p className="mt-2 text-xs text-neutral-500 text-pretty">
                Output: {contract.output.description}
              </p>
            )}
          </Card>

          <Card title="Handler binding & authorization">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs font-medium text-neutral-500">
                  Handler
                </dt>
                <dd>
                  <pre className="mt-1 overflow-x-auto rounded bg-neutral-50 p-3 text-xs">
                    {JSON.stringify(contract?.handler ?? {}, null, 2)}
                  </pre>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-neutral-500">
                  Registered on routes
                </dt>
                <dd className="font-mono text-xs">
                  {contract?.routes
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
                  {contract?.auth.required
                    ? `Required${contract.auth.roles.length ? ` — roles: ${contract.auth.roles.join(", ")}` : ""}. Enforcement stays in your application; this is detection evidence only.`
                    : "No auth requirement detected."}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-neutral-500">
                  Confidence
                </dt>
                <dd>
                  <ConfidenceMeter value={Number(candidate.confidence)} />
                </dd>
              </div>
            </dl>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Review decision">
            {reviewable && site ? (
              <div className="space-y-4">
                <ActionForm action={approveCandidateAction}>
                  <input
                    type="hidden"
                    name="candidateId"
                    value={candidate.id}
                  />
                  <input type="hidden" name="siteId" value={site.id} />
                  <SubmitButton
                    className={buttonClass}
                    pendingText="Approving…"
                  >
                    Approve for publication
                  </SubmitButton>
                  <p className="mt-1 text-xs text-neutral-400 text-pretty">
                    Approval mints an immutable contract version. Nothing
                    reaches the live manifest until you publish from the Publish
                    screen.
                  </p>
                </ActionForm>
                <ActionForm
                  action={reviewCandidateAction}
                  className="space-y-2"
                >
                  <input
                    type="hidden"
                    name="candidateId"
                    value={candidate.id}
                  />
                  <input type="hidden" name="decision" value="rejected" />
                  <Field label="Rejection note (optional)">
                    <input
                      name="note"
                      maxLength={1000}
                      className={inputClass}
                    />
                  </Field>
                  <SubmitButton
                    className={dangerButtonClass}
                    pendingText="Rejecting…"
                  >
                    Reject
                  </SubmitButton>
                </ActionForm>
              </div>
            ) : (
              <p className="text-sm text-neutral-500 text-pretty">
                {status === "approved" &&
                  "Approved. Publish from the Publish screen to make it live."}
                {status === "rejected" &&
                  `Rejected${candidate.review_note ? ` — ${candidate.review_note}` : ""}.`}
                {status === "published" && "Published in the current manifest."}
                {reviewable &&
                  !site &&
                  "No site exists for this repository yet."}
              </p>
            )}
          </Card>

          <Card title="Validation & evaluations">
            {issues.length === 0 && evals.length === 0 ? (
              <p className="text-sm text-neutral-500">
                All deterministic checks passed.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {issues.map((issue, index) => (
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
                      <span className="font-mono text-xs">{issue.code}</span> —{" "}
                      {issue.message}
                    </span>
                  </li>
                ))}
                {evals.map((evalRun, index) => (
                  <li key={`eval-${index}`} className="flex gap-2">
                    <span
                      className={
                        evalRun.passed ? "text-green-700" : "text-amber-700"
                      }
                    >
                      {evalRun.passed ? "pass" : "fail"}
                    </span>
                    <span className="text-pretty">
                      <span className="font-mono text-xs">{evalRun.name}</span>{" "}
                      —{" "}
                      {
                        (evalRun.details as { details?: string } | null)
                          ?.details
                      }
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Source evidence">
            {!contract || contract.evidence.length === 0 ? (
              <p className="text-sm text-neutral-500">No evidence attached.</p>
            ) : (
              <ul className="space-y-3">
                {contract.evidence.map((evidence, index) => (
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
                        <pre className="mt-2 max-h-64 overflow-auto rounded bg-neutral-50 p-3 text-xs">
                          {evidence.excerpt}
                        </pre>
                      </details>
                    ) : evidence.kind === "crawl" ? (
                      <p className="text-pretty">
                        <span className="font-medium">Preview crawl</span> —{" "}
                        {evidence.summary}{" "}
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
    </div>
  );
}
