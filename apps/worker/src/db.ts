import postgres from "postgres";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { WorkerEnv } from "./env";

export type Sql = postgres.Sql;

/** postgres.js json() with a workable input type (its JSONValue is too narrow). */
export function jsonb(
  sql: Pick<Sql, "json">,
  value: unknown,
): ReturnType<Sql["json"]> {
  return sql.json(value as never);
}

export interface WorkerContext {
  sql: Sql;
  supabase: SupabaseClient;
  env: WorkerEnv;
}

export function createWorkerContext(env: WorkerEnv): WorkerContext {
  const sql = postgres(env.SUPABASE_DB_URL, {
    max: env.WORKER_CONCURRENCY + 2,
    onnotice: () => {},
  });
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { sql, supabase, env };
}

export interface RunRow {
  id: string;
  repository_id: string;
  org_id: string;
  commit_id: string;
  status: string;
  stage: string;
  stage_statuses: Record<string, unknown>;
  sha: string;
  repo_full_name: string;
  repo_owner: string;
  repo_name: string;
  default_branch: string;
  installation_id: number;
}

export async function loadRun(sql: Sql, runId: string): Promise<RunRow | null> {
  const rows = await sql<RunRow[]>`
    select r.id, r.repository_id, r.org_id, r.commit_id, r.status, r.stage,
           r.stage_statuses, c.sha,
           repo.full_name as repo_full_name, repo.owner as repo_owner, repo.name as repo_name,
           repo.default_branch,
           gi.installation_id
    from analysis_runs r
    join repository_commits c on c.id = r.commit_id
    join repositories repo on repo.id = r.repository_id
    join github_installations gi on gi.id = repo.installation_id
    where r.id = ${runId}
  `;
  return rows[0] ?? null;
}

export async function markStage(
  sql: Sql,
  runId: string,
  stage: string,
  status: "running" | "succeeded" | "failed" | "skipped",
  detail: Record<string, unknown> = {},
): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    update analysis_runs
    set stage = ${stage}::analysis_stage,
        stage_statuses = stage_statuses || ${jsonb(sql, { [stage]: { status, at: new Date().toISOString(), ...detail } })}::jsonb,
        started_at = coalesce(started_at, now())
    where id = ${runId} and status in ('queued', 'running')
    returning id
  `;
  return rows.length === 1;
}

/**
 * Completes a stage and dispatches the next one in the same transaction.
 * The queued marker in stage_statuses is the dispatch idempotency key: a
 * redelivered stage can repeat its writes, but it can never fan out twice.
 */
export async function completeStage(
  sql: Sql,
  runId: string,
  stage: string,
  status: "succeeded" | "skipped",
  detail: Record<string, unknown>,
  nextStage: string | null,
): Promise<void> {
  await sql.begin(async (tx) => {
    const rows = await tx<
      { status: string; stage_statuses: Record<string, { status?: string }> }[]
    >`
      select status, stage_statuses
      from analysis_runs
      where id = ${runId}
      for update
    `;
    const run = rows[0];
    if (!run || !["queued", "running"].includes(run.status)) return;

    const completed = run.stage_statuses?.[stage]?.status;
    if (completed === "succeeded" || completed === "skipped") return;

    const now = new Date().toISOString();
    await tx`
      update analysis_runs
      set stage = ${stage}::analysis_stage,
          stage_statuses = stage_statuses || ${jsonb(tx, {
            [stage]: { status, at: now, ...detail },
          })}::jsonb
      where id = ${runId}
    `;

    if (!nextStage) {
      await tx`
        update analysis_runs
        set status = 'succeeded', error = null, finished_at = now()
        where id = ${runId} and status in ('queued', 'running')
      `;
      return;
    }

    if (run.stage_statuses?.[nextStage]) return;
    await tx`
      update analysis_runs
      set stage = ${nextStage}::analysis_stage,
          stage_statuses = stage_statuses || ${jsonb(tx, {
            [nextStage]: { status: "queued", at: now },
          })}::jsonb
      where id = ${runId}
    `;
    await tx`
      select pgmq.send(
        'sodium_jobs',
        ${jsonb(tx, {
          type: "analysis.stage",
          runId,
          stage: nextStage,
          attempt: 0,
        })}::jsonb
      )
    `;
  });
}

export async function finishRun(
  sql: Sql,
  runId: string,
  status: "succeeded" | "failed" | "canceled",
  error?: Record<string, unknown>,
): Promise<void> {
  await sql`
    update analysis_runs
    set status = ${status}::run_status,
        error = ${error ? jsonb(sql, error) : null},
        finished_at = now()
    where id = ${runId}
  `;
}

export async function setRunRunning(sql: Sql, runId: string): Promise<void> {
  await sql`
    update analysis_runs
    set status = 'running', started_at = coalesce(started_at, now())
    where id = ${runId} and status in ('queued', 'running')
  `;
}
