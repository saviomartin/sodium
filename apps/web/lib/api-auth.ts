import "server-only";
import { createServiceClient } from "./supabase/service";
import { sha256 } from "./server-crypto";

export async function authenticateApiToken(
  request: Request,
): Promise<string | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer (sod_cli_[A-Za-z0-9_-]{43})$/.exec(authorization);
  if (!match) return null;
  const service = createServiceClient();
  const { data } = await service
    .from("api_tokens")
    .select("id, owner_id, expires_at, revoked_at")
    .eq("token_hash", sha256(match[1]!))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now())
    return null;
  await service
    .from("api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);
  return data.owner_id;
}
