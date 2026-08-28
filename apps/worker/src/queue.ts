import {
  JOB_QUEUE,
  JobMessageSchema,
  MAX_JOB_ATTEMPTS,
  type JobMessage,
} from "@sodium/contracts";
import { jsonb, type Sql } from "./db";
import { log } from "./log";

/**
 * pgmq consumer over a direct Postgres connection.
 *  - `pgmq.read_with_poll` long-polls, so idle workers don't hot-loop
 *  - the visibility timeout makes crashed jobs reappear; every stage is
 *    idempotent for exactly this reason
 *  - handler outcomes: success → delete; retryable failure → re-enqueue with
 *    attempt+1 and bounded backoff; poison/maxed → archive for inspection
 */

const VISIBILITY_TIMEOUT_SECONDS = 120;
const POLL_SECONDS = 5;

interface QueueRow {
  msg_id: string;
  read_ct: number;
  message: unknown;
}

export type JobOutcome =
  | { kind: "done" }
  | { kind: "retry"; delaySeconds?: number; reason: string }
  | { kind: "fatal"; reason: string };

export type JobHandler = (message: JobMessage) => Promise<JobOutcome>;

export async function readJobs(
  sql: Sql,
  quantity: number,
): Promise<QueueRow[]> {
  return sql<QueueRow[]>`
    select msg_id, read_ct, message
    from pgmq.read_with_poll(${JOB_QUEUE}, ${VISIBILITY_TIMEOUT_SECONDS}, ${quantity}, ${POLL_SECONDS})
  `;
}

export async function deleteJob(sql: Sql, msgId: string): Promise<void> {
  await sql`select pgmq.delete(${JOB_QUEUE}, ${msgId}::bigint)`;
}

export async function archiveJob(sql: Sql, msgId: string): Promise<void> {
  await sql`select pgmq.archive(${JOB_QUEUE}, ${msgId}::bigint)`;
}

export async function enqueueJob(
  sql: Sql,
  message: JobMessage,
  delaySeconds = 0,
): Promise<void> {
  // Explicit ::integer — pgmq.send has integer and timestamptz delay overloads.
  await sql`select pgmq.send(${JOB_QUEUE}, ${jsonb(sql, message as unknown as Record<string, unknown>)}::jsonb, ${delaySeconds}::integer)`;
}

export function backoffSeconds(attempt: number): number {
  return Math.min(300, 5 * 2 ** attempt);
}

export async function processOne(
  sql: Sql,
  row: QueueRow,
  handler: JobHandler,
): Promise<void> {
  const parsed = JobMessageSchema.safeParse(row.message);
  if (!parsed.success) {
    log("error", "poison message: schema invalid, archiving", {
      msgId: row.msg_id,
    });
    await archiveJob(sql, row.msg_id);
    return;
  }
  // Poison guard: a message repeatedly redelivered via visibility timeout
  // (e.g. handler crashes before any outcome) is archived, never looped.
  if (row.read_ct > MAX_JOB_ATTEMPTS + 2) {
    log("error", "poison message: redelivered too often, archiving", {
      msgId: row.msg_id,
      readCt: row.read_ct,
    });
    await archiveJob(sql, row.msg_id);
    return;
  }
  const message = parsed.data;
  const label = {
    msgId: row.msg_id,
    type: message.type,
    attempt: message.attempt,
  };
  log("info", "job start", label);

  let outcome: JobOutcome;
  try {
    outcome = await handler(message);
  } catch (error) {
    outcome = {
      kind: "retry",
      reason: error instanceof Error ? error.message : "unhandled exception",
    };
  }

  switch (outcome.kind) {
    case "done":
      await deleteJob(sql, row.msg_id);
      log("info", "job done", label);
      return;
    case "fatal":
      log("error", "job fatal, archiving", {
        ...label,
        reason: outcome.reason,
      });
      await archiveJob(sql, row.msg_id);
      return;
    case "retry": {
      const nextAttempt = message.attempt + 1;
      if (nextAttempt >= MAX_JOB_ATTEMPTS) {
        log("error", "job exceeded max attempts, archiving", {
          ...label,
          reason: outcome.reason,
        });
        await archiveJob(sql, row.msg_id);
        return;
      }
      await enqueueJob(
        sql,
        { ...message, attempt: nextAttempt },
        outcome.delaySeconds ?? backoffSeconds(nextAttempt),
      );
      await deleteJob(sql, row.msg_id);
      log("warn", "job re-enqueued", {
        ...label,
        nextAttempt,
        reason: outcome.reason,
      });
      return;
    }
  }
}

export interface ConsumerHandle {
  stop(): Promise<void>;
}

export function startConsumer(
  sql: Sql,
  concurrency: number,
  handler: JobHandler,
): ConsumerHandle {
  let stopped = false;
  let inFlight = 0;

  const loop = async (): Promise<void> => {
    while (!stopped) {
      try {
        const rows = await readJobs(sql, 1);
        if (rows.length === 0) continue;
        inFlight++;
        try {
          await processOne(sql, rows[0]!, handler);
        } finally {
          inFlight--;
        }
      } catch (error) {
        log("error", "consumer loop error", {
          error: error instanceof Error ? error.message : String(error),
        });
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  };

  const loops = Array.from({ length: concurrency }, () => loop());

  return {
    async stop() {
      stopped = true;
      await Promise.allSettled(loops);
      while (inFlight > 0)
        await new Promise((resolve) => setTimeout(resolve, 100));
    },
  };
}
