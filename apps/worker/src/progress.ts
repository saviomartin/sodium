import {
  RUN_PROGRESS_EVENT,
  runChannel,
  type RunProgressEvent,
} from "@sodium/contracts";
import { jsonb, type Sql } from "./db";
import { log } from "./log";

/**
 * Streams stage progress to the dashboard over Supabase Realtime broadcast
 * (`realtime.send` on private `run:{id}` channels). RLS on realtime.messages
 * restricts delivery to members of the run's organization.
 */
export async function sendProgress(
  sql: Sql,
  event: RunProgressEvent,
): Promise<void> {
  try {
    await sql`
      select realtime.send(
        ${jsonb(sql, event as unknown as Record<string, unknown>)}::jsonb,
        ${RUN_PROGRESS_EVENT},
        ${runChannel(event.runId)},
        true
      )
    `;
  } catch (error) {
    // Progress is best-effort; job state lives in analysis_runs.
    log("warn", "realtime progress send failed", {
      runId: event.runId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function progressEvent(
  runId: string,
  stage: RunProgressEvent["stage"],
  status: RunProgressEvent["status"],
  extras: Partial<Pick<RunProgressEvent, "percent" | "message" | "error">> = {},
): RunProgressEvent {
  return { runId, stage, status, at: new Date().toISOString(), ...extras };
}
