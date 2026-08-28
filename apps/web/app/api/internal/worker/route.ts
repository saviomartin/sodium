import { timingSafeEqual } from "node:crypto";
import { createWorkerContext } from "@sodium/worker/db";
import { loadEnv } from "@sodium/worker/env";
import { setLogLevel } from "@sodium/worker/log";
import { drainAvailableJobs } from "@sodium/worker/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const actual = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!expected || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

async function drain(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let ctx: ReturnType<typeof createWorkerContext> | null = null;
  try {
    const workerEnv = loadEnv();
    setLogLevel(workerEnv.LOG_LEVEL);
    ctx = createWorkerContext(workerEnv);
    const processed = await drainAvailableJobs(ctx, {
      maxJobs: 25,
      deadlineMs: Date.now() + 270_000,
    });
    return Response.json({ ok: true, processed });
  } catch (error) {
    console.error("worker drain failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "worker drain failed" }, { status: 500 });
  } finally {
    await ctx?.sql.end({ timeout: 5 });
  }
}

export const GET = drain;
export const POST = drain;
