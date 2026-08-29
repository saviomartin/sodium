import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  NextJsAnalyzer,
  RepoWorkspace,
  detectAppDir,
  type StaticAnalysis,
} from "@sodium/analyzer";
import {
  validateContract,
  validateContractSet,
  type ActionContract,
  type AnalysisStage,
  type JobError,
} from "@sodium/contracts";
import { jsonb, type RunRow, type WorkerContext } from "../db";
import {
  completeStage,
  finishRun,
  loadRun,
  markStage,
  setRunRunning,
} from "../db";
import { progressEvent, sendProgress } from "../progress";
import { selectRepoProvider } from "../providers/repo-provider";
import {
  selectAiProvider,
  isScriptFormCapability,
  serverActionInputSchema,
} from "../providers/ai-provider";
import {
  assembleContract,
  buildPrimitives,
  type AssembledCandidate,
} from "./primitives";
import { runCandidateEvals } from "../evals";
import { log } from "../log";
import type { JobOutcome } from "../queue";

/**
 * The four resumable pipeline stages. Each is idempotent: it overwrites its
 * own outputs keyed by run id, so pgmq redelivery after a crash is safe.
 */

const STAGE_ORDER: AnalysisStage[] = [
  "clone",
  "static",
  "synthesize",
  "validate",
];

export async function handleAnalysisStage(
  ctx: WorkerContext,
  runId: string,
  stage: AnalysisStage,
): Promise<JobOutcome> {
  const run = await loadRun(ctx.sql, runId);
  if (!run) return { kind: "fatal", reason: `run ${runId} not found` };
  if (["succeeded", "failed", "canceled"].includes(run.status)) {
    return { kind: "done" };
  }

  const prior = (run.stage_statuses[stage] as { status?: string } | undefined)
    ?.status;
  if (prior === "succeeded" || prior === "skipped") {
    return { kind: "done" };
  }

  await setRunRunning(ctx.sql, runId);
  const active = await markStage(ctx.sql, runId, stage, "running");
  if (!active) return { kind: "done" };
  await sendProgress(ctx.sql, progressEvent(runId, stage, "running"));

  try {
    const detail = await executeStage(ctx, run, stage);
    const next = STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1] ?? null;
    await completeStage(
      ctx.sql,
      runId,
      stage,
      detail.skipped ? "skipped" : "succeeded",
      detail.info ?? {},
      next,
    );

    if (next) {
      await sendProgress(
        ctx.sql,
        progressEvent(runId, stage, "succeeded", { message: detail.message }),
      );
    } else {
      await sendProgress(
        ctx.sql,
        progressEvent(runId, stage, "succeeded", {
          message: "analysis complete",
        }),
      );
    }
    return { kind: "done" };
  } catch (error) {
    const jobError = toJobError(error, stage);
    log("error", "stage failed", {
      runId,
      stage,
      code: jobError.code,
      message: jobError.message,
    });
    await markStage(ctx.sql, runId, stage, "failed", { error: jobError });
    if (jobError.retryable) {
      await sendProgress(
        ctx.sql,
        progressEvent(runId, stage, "running", {
          message: `retrying: ${jobError.code}`,
        }),
      );
      return { kind: "retry", reason: jobError.message };
    }
    await finishRun(ctx.sql, runId, "failed", jobError);
    await sendProgress(
      ctx.sql,
      progressEvent(runId, stage, "failed", { error: jobError }),
    );
    return { kind: "fatal", reason: jobError.message };
  }
}

interface StageDetail {
  message?: string;
  info?: Record<string, unknown>;
  skipped?: boolean;
}

async function executeStage(
  ctx: WorkerContext,
  run: RunRow,
  stage: AnalysisStage,
): Promise<StageDetail> {
  switch (stage) {
    case "clone":
      return cloneStage(ctx, run);
    case "static":
      return staticStage(ctx, run);
    case "synthesize":
      return synthesizeStage(ctx, run);
    case "validate":
      return validateStage(ctx, run);
  }
}

async function ensureSnapshot(
  ctx: WorkerContext,
  run: RunRow,
): Promise<string> {
  const provider = selectRepoProvider(ctx.env);
  return provider.ensureSnapshot({
    runId: run.id,
    installationId: run.installation_id,
    owner: run.repo_owner,
    repo: run.repo_name,
    sha: run.sha,
  });
}

// Stage 1: materialize the commit into an isolated scratch workspace.
async function cloneStage(
  ctx: WorkerContext,
  run: RunRow,
): Promise<StageDetail> {
  const snapshotDir = await ensureSnapshot(ctx, run);
  const workspace = new RepoWorkspace(snapshotDir);
  const files = workspace.listFiles();
  const appDir = detectAppDir(files);
  if (!appDir) {
    throw new StageError(
      "parse_failed",
      "repository is not a Next.js App Router project",
      false,
    );
  }
  return {
    message: `snapshot ready (${files.length} files)`,
    info: { files: files.length, appDir },
  };
}

// Stage 2: static extraction with @sodium/analyzer; persists routes + summary.
async function staticStage(
  ctx: WorkerContext,
  run: RunRow,
): Promise<StageDetail> {
  const snapshotDir = await ensureSnapshot(ctx, run);
  const analysis = await new NextJsAnalyzer(
    new RepoWorkspace(snapshotDir),
  ).analyze();

  await uploadArtifact(
    ctx,
    run,
    "analysis_summary",
    "static-analysis.json",
    JSON.stringify(analysis),
    "application/json",
  );

  await ctx.sql.begin(async (sql) => {
    await sql`delete from discovered_routes where run_id = ${run.id}`;
    for (const route of analysis.routes) {
      await sql`
        insert into discovered_routes (run_id, org_id, url_pattern, path_pattern, kind, file_path, meta)
        values (${run.id}, ${run.org_id}, ${route.urlPattern}, ${route.pathPattern}, ${route.kind},
                ${route.span.filePath}, ${jsonb(sql, { params: route.params })})
      `;
    }
  });

  return {
    message: `found ${analysis.routes.length} routes, ${analysis.links.length} links, ${analysis.forms.length} forms, ${analysis.serverActions.length} actions, ${analysis.routeHandlers.length} handlers`,
    info: {
      routes: analysis.routes.length,
      forms: analysis.forms.length,
      links: analysis.links.length,
      serverActions: analysis.serverActions.length,
      routeHandlers: analysis.routeHandlers.length,
      zodSchemas: analysis.zodSchemas.length,
      warnings: analysis.warnings.length,
    },
  };
}

// Stage 3: AI synthesis (or deterministic fixture synthesis) into candidates.
async function synthesizeStage(
  ctx: WorkerContext,
  run: RunRow,
): Promise<StageDetail> {
  const analysis = await downloadAnalysis(ctx, run);
  const primitives = buildPrimitives(analysis);

  const provider = selectAiProvider(ctx.env);
  let synthesis;
  try {
    synthesis = await provider.proposeTools({
      analysis,
      primitives,
    });
  } catch (error) {
    throw new StageError(
      "ai_generation_failed",
      error instanceof Error ? error.message : "generation failed",
      true,
    );
  }

  let malformed = 0;
  const malformedIssues: string[] = [];
  const assembled: AssembledCandidate[] = [];
  for (const proposal of synthesis.tools) {
    try {
      assembled.push(assembleContract(run.repository_id, proposal, primitives));
    } catch (error) {
      malformed++;
      if (malformedIssues.length < 5) {
        malformedIssues.push(
          error instanceof Error
            ? error.message.slice(0, 300)
            : "invalid proposal",
        );
      }
    }
  }

  const potential = countPotentialCapabilities(analysis);
  assertCandidateCoverage(
    potential,
    synthesis.tools.length,
    assembled.length,
    malformedIssues,
  );

  await ctx.sql.begin(async (sql) => {
    await sql`select id from analysis_runs where id = ${run.id} for update`;
    await sql`delete from action_candidates where run_id = ${run.id}`;
    for (const { contract } of assembled) {
      await sql`
        insert into action_candidates
          (run_id, org_id, action_id, name, title, description, contract, risk_level, confirmation, confidence, status)
        values
          (${run.id}, ${run.org_id}, ${contract.actionId}, ${contract.name}, ${contract.title},
           ${contract.description}, ${jsonb(sql, contract as unknown as Record<string, unknown>)},
           ${contract.riskLevel}, ${contract.confirmation}, ${contract.confidence}, 'proposed')
      `;
    }
    const persisted = await sql<{ count: number }[]>`
      select count(*)::int as count from action_candidates where run_id = ${run.id}
    `;
    const count = persisted[0]?.count ?? 0;
    if (count !== assembled.length) {
      throw new StageError(
        "ai_output_invalid",
        `Persisted ${count} of ${assembled.length} assembled tool candidates`,
        false,
      );
    }
  });

  return {
    message:
      synthesis.mode === "ai"
        ? `AI proposed ${assembled.length} candidate tools`
        : `proposed ${assembled.length} candidate tools using safe fallback`,
    info: {
      proposed: assembled.length,
      malformed,
      ...(malformedIssues.length > 0 ? { malformedIssues } : {}),
      potential,
      mode: synthesis.mode,
      model: synthesis.model,
      attemptedModels: synthesis.attemptedModels,
      modelErrors: synthesis.modelErrors,
      usage: synthesis.usage,
      discarded: synthesis.discarded ?? 0,
      supplemented: synthesis.supplemented ?? 0,
      fallbackReason: synthesis.fallbackReason,
    },
  };
}

// Stage 4: deterministic validation + evals gate candidates for review.
async function validateStage(
  ctx: WorkerContext,
  run: RunRow,
): Promise<StageDetail> {
  const rows = await ctx.sql<{ id: string; contract: unknown }[]>`
    select id, contract from action_candidates where run_id = ${run.id}
  `;
  const parsed = rows.map((row) => ({
    id: row.id,
    contract: row.contract as ActionContract,
  }));
  const proposed = Number(
    (run.stage_statuses.synthesize as { proposed?: number } | undefined)
      ?.proposed ?? 0,
  );
  if (proposed > 0 && parsed.length === 0) {
    throw new StageError(
      "validation_failed",
      `Synthesis reported ${proposed} candidates but none were available for validation`,
      false,
    );
  }
  const setIssues = validateContractSet(parsed.map((row) => row.contract));

  let ready = 0;
  let needsReview = 0;
  let rejected = 0;
  const readyDrafts: { candidateId: string; contract: ActionContract }[] = [];

  for (const row of parsed) {
    const result = validateContract(row.contract);
    const crossIssues = setIssues.get(row.contract.actionId) ?? [];
    const allIssues = [...result.issues, ...crossIssues];
    const hasErrors = allIssues.some((issue) => issue.severity === "error");

    const evals = hasErrors
      ? []
      : runCandidateEvals(
          row.contract,
          parsed.map((p) => p.contract),
        );
    const evalFailed = evals.some((evalResult) => !evalResult.passed);

    let status: "proposed" | "needs_review" | "rejected";
    if (hasErrors) {
      status = "rejected";
      rejected++;
    } else if (
      allIssues.length > 0 ||
      evalFailed ||
      row.contract.confidence < 0.7
    ) {
      status = "needs_review";
      needsReview++;
    } else {
      status = "proposed";
      ready++;
      readyDrafts.push({ candidateId: row.id, contract: row.contract });
    }

    await ctx.sql.begin(async (sql) => {
      await sql`
        update action_candidates
        set status = ${status}::candidate_status, validation_issues = ${jsonb(sql, allIssues)}::jsonb
        where id = ${row.id}
      `;
      await sql`delete from eval_runs where candidate_id = ${row.id}`;
      for (const evalResult of evals) {
        await sql`
          insert into eval_runs (candidate_id, org_id, name, passed, details)
          values (${row.id}, ${run.org_id}, ${evalResult.name}, ${evalResult.passed},
                  ${jsonb(sql, { details: evalResult.details })}::jsonb)
        `;
      }
    });
  }

  const refreshedDrafts = await refreshActiveDraftContracts(
    ctx,
    run,
    readyDrafts,
  );

  return {
    message: `validated ${parsed.length} candidates (${ready} ready, ${needsReview} need review, ${rejected} rejected)`,
    info: {
      total: parsed.length,
      ready,
      needsReview,
      rejected,
      refreshedActiveDrafts: refreshedDrafts,
    },
  };
}

export function countPotentialCapabilities(analysis: StaticAnalysis): number {
  const pages = new Set(
    analysis.routes
      .filter(
        (route) =>
          route.kind === "page" &&
          route.urlPattern !== "/" &&
          !route.urlPattern.includes("..."),
      )
      .map((route) => route.urlPattern),
  );
  const links = new Set(
    (analysis.links ?? [])
      .filter((link) => link.href !== "/")
      .map((link) => link.href),
  );
  const forms = analysis.forms.filter(isScriptFormCapability).length;
  const actionNameCounts = new Map<string, number>();
  for (const action of analysis.serverActions) {
    actionNameCounts.set(
      action.name,
      (actionNameCounts.get(action.name) ?? 0) + 1,
    );
  }
  const coveredActions = new Set(
    analysis.forms
      .filter(
        (form) =>
          isScriptFormCapability(form) &&
          form.action.kind === "server_action" &&
          actionNameCounts.get(form.action.name) === 1,
      )
      .map((form) =>
        form.action.kind === "server_action" ? form.action.name : "",
      ),
  );
  const actions = analysis.serverActions.filter(
    (action) =>
      !coveredActions.has(action.name) &&
      serverActionInputSchema(analysis, action) !== null,
  ).length;
  return pages.size + links.size + forms + actions;
}

export function assertCandidateCoverage(
  potential: number,
  proposed: number,
  assembled: number,
  malformedIssues: string[] = [],
): void {
  if (potential === 0 || assembled > 0) return;
  throw new StageError(
    "ai_output_invalid",
    proposed > 0
      ? `All ${proposed} generated tool proposals were invalid${
          malformedIssues.length > 0 ? `: ${malformedIssues.join("; ")}` : ""
        }`
      : `Tool synthesis returned no candidates despite ${potential} source-grounded capabilities`,
    false,
  );
}

async function refreshActiveDraftContracts(
  ctx: WorkerContext,
  run: RunRow,
  drafts: { candidateId: string; contract: ActionContract }[],
): Promise<number> {
  return ctx.sql.begin(async (sql) => {
    let refreshed = 0;
    for (const draft of drafts) {
      const contracts = await sql<{ id: string; next_version: number }[]>`
        select tc.id,
               (select coalesce(max(history.version), 0) + 1
                from contract_versions history
                where history.contract_id = tc.id) as next_version
        from tool_contracts tc
        join sites s on s.id = tc.site_id
        left join contract_versions current on current.id = tc.latest_version_id
        where s.repository_id = ${run.repository_id}
          and tc.action_id = ${draft.contract.actionId}
          and tc.status = 'active'
          and current.contract is distinct from ${jsonb(
            sql,
            draft.contract as unknown as Record<string, unknown>,
          )}::jsonb
        for update of tc
      `;
      for (const contract of contracts) {
        const versions = await sql<{ id: string }[]>`
          insert into contract_versions
            (contract_id, org_id, version, contract, created_from_candidate)
          values
            (${contract.id}, ${run.org_id}, ${contract.next_version},
             ${jsonb(
               sql,
               draft.contract as unknown as Record<string, unknown>,
             )}::jsonb,
             ${draft.candidateId})
          returning id
        `;
        const version = versions[0];
        if (!version) continue;
        await sql`
          update tool_contracts
          set latest_version_id = ${version.id}, name = ${draft.contract.name}
          where id = ${contract.id}
        `;
        refreshed++;
      }
    }
    return refreshed;
  });
}

// --- helpers ---------------------------------------------------------------

export class StageError extends Error {
  constructor(
    readonly code: JobError["code"],
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

function toJobError(error: unknown, stage: AnalysisStage): JobError {
  if (error instanceof StageError) {
    return {
      code: error.code,
      message: error.message.slice(0, 2000),
      retryable: error.retryable,
      stage,
    };
  }
  return {
    code: "internal",
    message: (error instanceof Error ? error.message : "unknown error").slice(
      0,
      2000,
    ),
    retryable: true,
    stage,
  };
}

function artifactPath(run: RunRow, fileName: string): string {
  return `${run.org_id}/${run.id}/${fileName}`;
}

async function uploadArtifact(
  ctx: WorkerContext,
  run: RunRow,
  kind: "analysis_summary",
  fileName: string,
  content: string | Uint8Array,
  contentType: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  const path = artifactPath(run, fileName);
  const body =
    typeof content === "string" ? new TextEncoder().encode(content) : content;
  const { error } = await ctx.supabase.storage
    .from("artifacts")
    .upload(path, body as unknown as Blob | ArrayBuffer, {
      contentType,
      upsert: true,
    });
  if (error)
    throw new StageError(
      "internal",
      `artifact upload failed: ${error.message}`,
      true,
    );

  await ctx.sql`
    insert into run_artifacts (run_id, org_id, kind, storage_path, meta)
    select ${run.id}, ${run.org_id}, ${kind}, ${path}, ${jsonb(ctx.sql, meta)}::jsonb
    where not exists (select 1 from run_artifacts where run_id = ${run.id} and storage_path = ${path})
  `;
}

async function downloadArtifactJson<T>(
  ctx: WorkerContext,
  run: RunRow,
  fileName: string,
): Promise<T | null> {
  const { data, error } = await ctx.supabase.storage
    .from("artifacts")
    .download(artifactPath(run, fileName));
  if (error || !data) return null;
  return JSON.parse(await data.text()) as T;
}

async function downloadAnalysis(
  ctx: WorkerContext,
  run: RunRow,
): Promise<StaticAnalysis> {
  const analysis = await downloadArtifactJson<StaticAnalysis>(
    ctx,
    run,
    "static-analysis.json",
  );
  if (!analysis) {
    // Redelivery may land here before the static artifact exists (e.g. bucket
    // wiped). Recompute rather than fail: stages must be self-sufficient.
    const snapshotDir = await ensureSnapshot(ctx, run);
    return new NextJsAnalyzer(new RepoWorkspace(snapshotDir)).analyze();
  }
  return analysis;
}

/** Re-used by fixture/dev tooling: read a snapshot file safely. */
export function readSnapshotFile(snapshotDir: string, relPath: string): string {
  return readFileSync(join(snapshotDir, relPath), "utf8");
}
