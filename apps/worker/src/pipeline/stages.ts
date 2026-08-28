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
  readVaultSecret,
  setRunRunning,
} from "../db";
import { progressEvent, sendProgress } from "../progress";
import { selectRepoProvider } from "../providers/repo-provider";
import { selectCrawler, type CrawledPage } from "../providers/crawler";
import { selectAiProvider } from "../providers/ai-provider";
import {
  assembleContract,
  buildPrimitives,
  type AssembledCandidate,
} from "./primitives";
import { runCandidateEvals } from "../evals";
import { log } from "../log";
import type { JobOutcome } from "../queue";

/**
 * The five resumable pipeline stages. Each is idempotent: it overwrites its
 * own outputs keyed by run id, so pgmq redelivery after a crash is safe.
 */

const STAGE_ORDER: AnalysisStage[] = [
  "clone",
  "static",
  "crawl",
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
    case "crawl":
      return crawlStage(ctx, run);
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
    message: `found ${analysis.routes.length} routes, ${analysis.forms.length} forms, ${analysis.serverActions.length} actions, ${analysis.routeHandlers.length} handlers`,
    info: {
      routes: analysis.routes.length,
      forms: analysis.forms.length,
      serverActions: analysis.serverActions.length,
      routeHandlers: analysis.routeHandlers.length,
      zodSchemas: analysis.zodSchemas.length,
      warnings: analysis.warnings.length,
    },
  };
}

// Stage 3: optional authenticated preview crawl (DOM/ARIA first, screenshots second).
async function crawlStage(
  ctx: WorkerContext,
  run: RunRow,
): Promise<StageDetail> {
  if (!run.environment_base_url) {
    await uploadArtifact(
      ctx,
      run,
      "crawl_snapshot",
      "crawl.json",
      "[]",
      "application/json",
    );
    return { skipped: true, message: "no preview environment configured" };
  }

  const analysis = await downloadAnalysis(ctx, run);
  const staticPaths = analysis.routes
    .filter((route) => route.kind === "page" && route.params.length === 0)
    .map((route) => route.urlPattern);
  const paths = [...new Set(["/", ...staticPaths])];

  const credential = run.environment_credential_secret_id
    ? await readVaultSecret(ctx.sql, run.environment_credential_secret_id)
    : null;

  const crawler = selectCrawler(ctx.env, true);
  const pages = await crawler.crawl({
    baseUrl: run.environment_base_url,
    paths,
    authMode: (run.environment_auth_mode ?? "none") as
      "none" | "cookie" | "basic",
    credential,
  });

  const reachable = pages.filter((page) => page.status !== null);
  if (pages.length > 0 && reachable.length === 0) {
    throw new StageError(
      "preview_unreachable",
      `preview at ${run.environment_base_url} did not respond`,
      true,
    );
  }

  await ctx.sql`delete from run_artifacts where run_id = ${run.id} and kind in ('crawl_snapshot', 'screenshot')`;
  for (const [index, page] of pages.entries()) {
    if (!page.screenshot) continue;
    await uploadArtifact(
      ctx,
      run,
      "screenshot",
      `screenshots/${index}.png`,
      page.screenshot,
      "image/png",
      {
        path: page.path,
      },
    );
  }
  const serializable = pages.map(({ screenshot, ...rest }) => {
    void screenshot; // binary data lives in storage, not in the JSON snapshot
    return rest;
  });
  await uploadArtifact(
    ctx,
    run,
    "crawl_snapshot",
    "crawl.json",
    JSON.stringify(serializable),
    "application/json",
  );

  return {
    message: `crawled ${reachable.length}/${pages.length} pages`,
    info: { pages: pages.length, reachable: reachable.length },
  };
}

// Stage 4: AI synthesis (or deterministic fixture synthesis) into candidates.
async function synthesizeStage(
  ctx: WorkerContext,
  run: RunRow,
): Promise<StageDetail> {
  const analysis = await downloadAnalysis(ctx, run);
  const crawledPages = await downloadCrawl(ctx, run);
  const primitives = buildPrimitives(analysis, crawledPages);

  const provider = selectAiProvider(ctx.env);
  let proposals;
  try {
    proposals = await provider.proposeTools({
      analysis,
      crawledPages,
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
  const assembled: AssembledCandidate[] = [];
  for (const proposal of proposals) {
    try {
      assembled.push(assembleContract(run.repository_id, proposal, primitives));
    } catch {
      malformed++;
    }
  }

  await ctx.sql.begin(async (sql) => {
    await sql`delete from action_candidates where run_id = ${run.id}`;
    for (const { contract } of assembled) {
      await sql`
        insert into action_candidates
          (run_id, org_id, action_id, name, title, description, contract, risk_level, confirmation, confidence, status)
        values
          (${run.id}, ${run.org_id}, ${contract.actionId}, ${contract.name}, ${contract.title},
           ${contract.description}, ${jsonb(sql, contract as unknown as Record<string, unknown>)},
           ${contract.riskLevel}, ${contract.confirmation}, ${contract.confidence}, 'proposed')
        on conflict (run_id, action_id) do nothing
      `;
    }
  });

  return {
    message: `proposed ${assembled.length} candidate tools`,
    info: { proposed: assembled.length, malformed },
  };
}

// Stage 5: deterministic validation + evals gate candidates for review.
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
  const setIssues = validateContractSet(parsed.map((row) => row.contract));

  let ready = 0;
  let needsReview = 0;
  let rejected = 0;

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

  return {
    message: `validated ${parsed.length} candidates (${ready} ready, ${needsReview} need review, ${rejected} rejected)`,
    info: { total: parsed.length, ready, needsReview, rejected },
  };
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
  kind: "analysis_summary" | "crawl_snapshot" | "screenshot",
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

async function downloadCrawl(
  ctx: WorkerContext,
  run: RunRow,
): Promise<CrawledPage[]> {
  const pages = await downloadArtifactJson<CrawledPage[]>(
    ctx,
    run,
    "crawl.json",
  );
  return (pages ?? []).map((page) => ({ ...page, screenshot: null }));
}

/** Re-used by fixture/dev tooling: read a snapshot file safely. */
export function readSnapshotFile(snapshotDir: string, relPath: string): string {
  return readFileSync(join(snapshotDir, relPath), "utf8");
}
