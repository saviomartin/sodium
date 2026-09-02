import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { newApiToken, sha256 } from "@/lib/server-crypto";

export const runtime = "nodejs";

const InputSchema = z
  .object({ deviceCode: z.string().min(32).max(128) })
  .strict();

export async function POST(request: Request) {
  const parsed = InputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "invalid request" }, { status: 400 });
  const service = createServiceClient();
  const deviceHash = sha256(parsed.data.deviceCode);
  const { data: authorization } = await service
    .from("cli_auth_requests")
    .select("user_id, authorized_at, consumed_at, expires_at")
    .eq("device_hash", deviceHash)
    .maybeSingle();
  if (!authorization)
    return Response.json({ error: "login not found" }, { status: 404 });
  if (new Date(authorization.expires_at).getTime() <= Date.now()) {
    return Response.json({ error: "login expired" }, { status: 410 });
  }
  if (authorization.consumed_at) {
    return Response.json({ error: "login already completed" }, { status: 409 });
  }
  if (!authorization.user_id || !authorization.authorized_at) {
    return Response.json({ status: "pending" });
  }

  const token = newApiToken();
  const { data: tokenId, error } = await service.rpc("exchange_cli_auth", {
    p_device_hash: deviceHash,
    p_token_hash: sha256(token),
    p_last_four: token.slice(-4),
  });
  if (error || !tokenId) {
    return Response.json({ error: "login already completed" }, { status: 409 });
  }
  return Response.json({ status: "complete", token });
}
