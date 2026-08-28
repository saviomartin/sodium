import { verifyWebhookSignature } from "@/lib/github";
import { env } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";
import { after } from "next/server";

/**
 * GitHub webhook receiver. Order of checks, per docs/architecture.md §1.4:
 *  1. HMAC signature over the RAW body (timing-safe)
 *  2. delivery-id idempotency (X-GitHub-Delivery is stable across redeliveries)
 *  3. repository AND installation ownership against our records
 * Only then is work enqueued; processing is async and this handler responds
 * fast. Payload content is untrusted data throughout.
 */
export async function POST(request: Request) {
  const secret = env.GITHUB_WEBHOOK_SECRET;
  if (!secret)
    return Response.json({ error: "webhooks not configured" }, { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = request.headers.get("x-github-event") ?? "";
  const deliveryId = request.headers.get("x-github-delivery") ?? "";
  if (!deliveryId)
    return Response.json({ error: "missing delivery id" }, { status: 400 });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }

  const service = createServiceClient();

  // Push delivery recording and queueing happen inside one database
  // transaction. Other event types only need the idempotency claim.
  if (event === "push") {
    return handlePush(service, payload, deliveryId);
  }

  const claim = await claimDelivery(service, deliveryId, event);
  if (claim instanceof Response) return claim;

  switch (event) {
    case "installation":
      return handleInstallation(service, payload);
    case "pull_request":
      // v1 scope: pull_request events are acknowledged but not analyzed.
      return Response.json({ ok: true, ignored: event });
    default:
      return Response.json({ ok: true, ignored: event });
  }
}

type Service = ReturnType<typeof createServiceClient>;

async function claimDelivery(
  service: Service,
  deliveryId: string,
  event: string,
): Promise<true | Response> {
  const { error } = await service
    .from("webhook_deliveries")
    .insert({ delivery_id: deliveryId, event });
  if (!error) return true;
  if (error.code === "23505")
    return Response.json({ ok: true, duplicate: true });
  return Response.json({ error: "ledger unavailable" }, { status: 500 });
}

async function handlePush(
  service: Service,
  payload: Record<string, unknown>,
  deliveryId: string,
) {
  const repository = payload.repository as { id?: number } | undefined;
  const installation = payload.installation as { id?: number } | undefined;
  const commitSha = typeof payload.after === "string" ? payload.after : "";
  const ref = typeof payload.ref === "string" ? payload.ref : "";
  if (
    !repository?.id ||
    !installation?.id ||
    !/^[a-f0-9]{40}$/.test(commitSha) ||
    commitSha === "0".repeat(40)
  ) {
    const claim = await claimDelivery(service, deliveryId, "push");
    if (claim instanceof Response) return claim;
    return Response.json({ ok: true, ignored: "malformed push" });
  }

  const { data, error } = await service.rpc("request_push_analysis", {
    p_delivery_id: deliveryId,
    p_github_repo_id: repository.id,
    p_installation_id: installation.id,
    p_commit_sha: commitSha,
    p_ref: ref,
  });
  if (error) return Response.json({ error: "enqueue failed" }, { status: 500 });

  // Start immediately in production. The minute cron is the durable recovery
  // path if this best-effort kick is interrupted by a deployment or outage.
  const workerSecret = env.CRON_SECRET ?? env.GITHUB_WEBHOOK_SECRET;
  if (workerSecret) {
    after(async () => {
      try {
        const response = await fetch(`${env.SITE_URL}/api/internal/worker`, {
          method: "POST",
          headers: { authorization: `Bearer ${workerSecret}` },
          cache: "no-store",
        });
        if (!response.ok) {
          console.error("worker kick failed", { status: response.status });
        }
      } catch (error) {
        console.error("worker kick failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }
  return Response.json(data);
}

async function handleInstallation(
  service: Service,
  payload: Record<string, unknown>,
) {
  const action = typeof payload.action === "string" ? payload.action : "";
  const installation = payload.installation as { id?: number } | undefined;
  if (!installation?.id)
    return Response.json({ ok: true, ignored: "malformed installation event" });

  if (action === "deleted" || action === "suspend") {
    await service
      .from("github_installations")
      .update({ suspended_at: new Date().toISOString() })
      .eq("installation_id", installation.id);
  } else if (action === "unsuspend") {
    await service
      .from("github_installations")
      .update({ suspended_at: null })
      .eq("installation_id", installation.id);
  }
  return Response.json({ ok: true });
}
