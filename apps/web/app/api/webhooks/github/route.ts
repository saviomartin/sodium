import { verifyWebhookSignature } from "@/lib/github";
import { env } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";

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

  // Idempotency: first writer wins; redeliveries return 200 without work.
  const { error: ledgerError } = await service
    .from("webhook_deliveries")
    .insert({ delivery_id: deliveryId, event });
  if (ledgerError) {
    if (ledgerError.code === "23505")
      return Response.json({ ok: true, duplicate: true });
    return Response.json({ error: "ledger unavailable" }, { status: 500 });
  }

  switch (event) {
    case "push":
      return handlePush(service, payload);
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

async function handlePush(service: Service, payload: Record<string, unknown>) {
  const repository = payload.repository as { id?: number } | undefined;
  const installation = payload.installation as { id?: number } | undefined;
  const after = typeof payload.after === "string" ? payload.after : "";
  const ref = typeof payload.ref === "string" ? payload.ref : "";
  if (!repository?.id || !installation?.id || !/^[a-f0-9]{40}$/.test(after)) {
    return Response.json({ ok: true, ignored: "malformed push" });
  }

  // Ownership: the repo must be one we track AND belong to the claimed
  // installation. A forged payload for someone else's repo enqueues nothing.
  const { data: repo } = await service
    .from("repositories")
    .select(
      "id, default_branch, github_installations!repositories_installation_id_fkey(installation_id)",
    )
    .eq("github_repo_id", repository.id)
    .maybeSingle();
  const storedInstallation = (
    repo?.github_installations as unknown as { installation_id: number } | null
  )?.installation_id;
  if (!repo || storedInstallation !== installation.id) {
    return Response.json({
      ok: true,
      ignored: "unknown repository/installation",
    });
  }
  if (ref !== `refs/heads/${repo.default_branch}`) {
    return Response.json({ ok: true, ignored: "non-default branch" });
  }

  const { error } = await service.rpc("enqueue_job", {
    p_message: {
      type: "sync.compare",
      repositoryId: repo.id,
      commitSha: after,
      deliveryId: crypto.randomUUID(),
      attempt: 0,
    } as never,
  });
  if (error) return Response.json({ error: "enqueue failed" }, { status: 500 });
  return Response.json({ ok: true, enqueued: "sync.compare" });
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
