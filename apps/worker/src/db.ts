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
  environment_id: string | null;
  status: string;
  stage: string;
  stage_statuses: Record<string, unknown>;
  sha: string;
  repo_full_name: string;
  repo_owner: string;
  repo_name: string;
  default_branch: string;
  installation_id: number;
  environment_base_url: string | null;
  environment_auth_mode: string | null;
  environment_credential_secret_id: string | null;
}

export async function loadRun(sql: Sql, runId: string): Promise<RunRow | null> {
  const rows = await sql<RunRow[]>`
    select r.id, r.repository_id, r.org_id, r.commit_id, r.environment_id, r.status, r.stage,
           r.stage_statuses, c.sha,
           repo.full_name as repo_full_name, repo.owner as repo_owner, repo.name as repo_name,
           repo.default_branch,
           gi.installation_id,
           e.base_url as environment_base_url, e.auth_mode as environment_auth_mode,
           e.credential_secret_id as environment_credential_secret_id
    from analysis_runs r
    join repository_commits c on c.id = r.commit_id
    join repositories repo on repo.id = r.repository_id
    join github_installations gi on gi.id = repo.installation_id
    left join environments e on e.id = r.environment_id
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
): Promise<void> {
  await sql`
    update analysis_runs
    set stage = ${stage}::analysis_stage,
        stage_statuses = stage_statuses || ${jsonb(sql, { [stage]: { status, at: new Date().toISOString(), ...detail } })}::jsonb,
        started_at = coalesce(started_at, now())
    where id = ${runId}
  `;
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

/** Reads a Vault-stored preview credential over the direct DB connection. */
export async function readVaultSecret(
  sql: Sql,
  secretId: string,
): Promise<string | null> {
  const rows = await sql<{ decrypted_secret: string }[]>`
    select decrypted_secret from vault.decrypted_secrets where id = ${secretId}
  `;
  return rows[0]?.decrypted_secret ?? null;
}
