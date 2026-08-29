import { timingSafeEqual } from "node:crypto";
import { reconcileRepositorySubscriptions } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const actual = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  return (
    expected.length > 0 &&
    actual.length === expected.length &&
    timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return Response.json({
      ok: true,
      ...(await reconcileRepositorySubscriptions()),
    });
  } catch (error) {
    console.error("Stripe reconciliation failed", { error });
    return Response.json(
      { error: "Stripe reconciliation failed" },
      { status: 500 },
    );
  }
}
