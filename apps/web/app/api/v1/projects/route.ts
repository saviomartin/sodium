import { z } from "zod";
import { authenticateApiToken } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { siteUrl } from "@/lib/env";
import { randomLowercase, sha256 } from "@/lib/server-crypto";

const InputSchema = z
  .object({ name: z.string().trim().min(1).max(120) })
  .strict();

export async function POST(request: Request) {
  const ownerId = await authenticateApiToken(request);
  if (!ownerId)
    return Response.json({ error: "invalid API token" }, { status: 401 });
  const parsed = InputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "invalid project" }, { status: 400 });

  const projectId = `prj_${randomLowercase(12)}`;
  const publishableKey = `sod_pk_${randomLowercase(32)}`;
  const service = createServiceClient();
  const { data: savedId, error } = await service.rpc(
    "create_or_rotate_project",
    {
      p_owner_id: ownerId,
      p_project_id: projectId,
      p_name: parsed.data.name,
      p_publishable_key_hash: sha256(publishableKey),
    },
  );
  if (error || !savedId) {
    console.error("Project creation failed", {
      code: error?.code,
      message: error?.message,
    });
    return Response.json(
      { error: "could not create project" },
      { status: 500 },
    );
  }
  return Response.json({
    schemaVersion: 1,
    projectId: savedId,
    publishableKey,
    endpoint: siteUrl(),
  });
}
