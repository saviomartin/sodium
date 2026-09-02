import { z } from "zod";
import {
  compileSodiumConfig,
  DEPLOYMENT_RECEIPT_VERSION,
  validateSodiumConfig,
} from "sodium-webmcp-spec";
import { signDeploymentReceipt } from "sodium-webmcp-spec/signing";
import { authenticateApiToken } from "@/lib/api-auth";
import { deploymentSigningKey } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";
import { randomLowercase, sha256 } from "@/lib/server-crypto";

const InputSchema = z
  .object({
    config: z.unknown(),
    configHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/v1/projects/[projectId]/deployments">,
) {
  const ownerId = await authenticateApiToken(request);
  if (!ownerId)
    return Response.json({ error: "invalid API token" }, { status: 401 });
  const { projectId } = await params;
  if (!/^prj_[a-z0-9]{8,24}$/.test(projectId)) {
    return Response.json({ error: "invalid project id" }, { status: 400 });
  }
  const body = InputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "invalid deployment" }, { status: 400 });
  const validation = validateSodiumConfig(body.data.config);
  if (!validation.ok || !validation.config) {
    return Response.json(
      { error: "invalid sodium.json", issues: validation.issues },
      { status: 422 },
    );
  }
  const expectedHash = sha256(
    JSON.stringify(compileSodiumConfig(validation.config)),
  );
  if (expectedHash !== body.data.configHash) {
    return Response.json({ error: "config hash mismatch" }, { status: 409 });
  }

  let signingKey: ReturnType<typeof deploymentSigningKey>;
  try {
    signingKey = deploymentSigningKey();
  } catch (signingError) {
    console.error("Deployment receipt signing is unavailable", {
      message:
        signingError instanceof Error ? signingError.message : "unknown error",
    });
    return Response.json(
      { error: "deployment signing unavailable" },
      { status: 503 },
    );
  }

  const deploymentId = `dep_${randomLowercase(16)}`;
  const { data, error } = await createServiceClient().rpc(
    "create_project_deployment",
    {
      p_owner_id: ownerId,
      p_project_id: projectId,
      p_deployment_id: deploymentId,
      p_config_hash: expectedHash,
      p_config: validation.config as never,
      p_tool_count: validation.config.tools.length,
    },
  );
  const deployment = data?.[0];
  if (error || !deployment) {
    const status = error?.message.includes("project_not_found") ? 404 : 500;
    return Response.json(
      { error: status === 404 ? "project not found" : "deployment failed" },
      { status },
    );
  }
  try {
    const receipt = signDeploymentReceipt(
      {
        receiptVersion: DEPLOYMENT_RECEIPT_VERSION,
        projectId,
        deploymentId: deployment.deployment_id,
        version: deployment.deployment_version,
        configHash: deployment.deployment_hash,
        origins: validation.config.app.origins,
      },
      signingKey,
    );
    return Response.json({
      id: deployment.deployment_id,
      version: deployment.deployment_version,
      configHash: deployment.deployment_hash,
      receipt,
    });
  } catch (signingError) {
    console.error("Deployment receipt signing failed", {
      message:
        signingError instanceof Error ? signingError.message : "unknown error",
    });
    return Response.json(
      { error: "deployment signing unavailable" },
      { status: 503 },
    );
  }
}
