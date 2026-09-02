import { z } from "zod";
import {
  DEPLOYMENT_ID_PATTERN,
  PROJECT_ID_PATTERN,
  PUBLISHABLE_KEY_PATTERN,
  SodiumConfigSchema,
  TOOL_ID_PATTERN,
  TOOL_NAME_PATTERN,
} from "sodium-webmcp-spec";
import { sha256 } from "@/lib/server-crypto";
import { createServiceClient } from "@/lib/supabase/service";

const EventSchema = z
  .object({
    projectId: z.string().regex(PROJECT_ID_PATTERN),
    key: z.string().regex(PUBLISHABLE_KEY_PATTERN),
    deploymentId: z.string().regex(DEPLOYMENT_ID_PATTERN).optional(),
    configVersion: z.number().int().positive().optional(),
    sdkVersion: z.string().min(1).max(32),
    event: z.enum([
      "sdk_ready",
      "tool_registered",
      "tool_register_failed",
      "tool_started",
      "tool_succeeded",
      "tool_failed",
      "confirmation_denied",
    ]),
    toolId: z.string().regex(TOOL_ID_PATTERN).optional(),
    toolName: z.string().regex(TOOL_NAME_PATTERN).optional(),
    invocationId: z.string().uuid().optional(),
    durationMs: z.number().int().min(0).max(3_600_000).optional(),
    errorCode: z.string().min(1).max(80).optional(),
    ts: z.number().int().positive(),
  })
  .strict();

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
} as const;

export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > 4096)
    return new Response(null, { status: 413, headers: CORS_HEADERS });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const parsed = EventSchema.safeParse(body);
  if (!parsed.success)
    return new Response(null, { status: 400, headers: CORS_HEADERS });

  const service = createServiceClient();
  const { data: project } = await service
    .from("projects")
    .select("id, publishable_key_hash, current_deployment_id")
    .eq("id", parsed.data.projectId)
    .maybeSingle();
  if (!project || project.publishable_key_hash !== sha256(parsed.data.key)) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }

  const deploymentId =
    parsed.data.deploymentId ?? project.current_deployment_id;
  if (!deploymentId)
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  const { data: deployment } = await service
    .from("deployments")
    .select("id, project_id, config")
    .eq("id", deploymentId)
    .eq("project_id", project.id)
    .maybeSingle();
  const config = SodiumConfigSchema.safeParse(deployment?.config);
  const origin = request.headers.get("origin");
  if (
    !deployment ||
    !config.success ||
    !origin ||
    !config.data.app.origins.includes(origin)
  ) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }

  const now = Date.now();
  const occurredAt =
    Math.abs(now - parsed.data.ts) <= 24 * 60 * 60 * 1000
      ? new Date(parsed.data.ts)
      : new Date(now);
  await service.from("usage_events").insert({
    project_id: project.id,
    deployment_id: deployment.id,
    config_version: parsed.data.configVersion ?? null,
    sdk_version: parsed.data.sdkVersion,
    event: parsed.data.event,
    tool_id: parsed.data.toolId ?? null,
    tool_name: parsed.data.toolName ?? null,
    invocation_id: parsed.data.invocationId ?? null,
    duration_ms: parsed.data.durationMs ?? null,
    error_code: parsed.data.errorCode ?? null,
    occurred_at: occurredAt.toISOString(),
  });
  return new Response(null, { status: 202, headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
