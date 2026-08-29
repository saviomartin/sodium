import { z } from "zod";
import { SITE_ID_PATTERN } from "@sodium/contracts";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Loader telemetry ingest. Privacy-preserving by construction: the schema
 * only admits event names, tool names, coarse numeric/boolean data — no tool
 * inputs, no page content. Unknown or oversized payloads are dropped.
 */

const EventSchema = z
  .object({
    siteId: z.string().regex(SITE_ID_PATTERN),
    loader: z.string().max(32),
    event: z.enum([
      "loader_ready",
      "manifest_fetch_failed",
      "manifest_rejected",
      "tool_invoked",
      "answer_engine_referral",
    ]),
    data: z
      .record(
        z.string().max(64),
        z.union([z.string().max(128), z.number(), z.boolean()]),
      )
      .default({}),
    ts: z.number(),
  })
  .strict();

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
} as const;

export async function POST(request: Request) {
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 4096)
      return new Response(null, { status: 413, headers: CORS_HEADERS });
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400, headers: CORS_HEADERS });
  }
  const parsed = EventSchema.safeParse(body);
  if (!parsed.success)
    return new Response(null, { status: 400, headers: CORS_HEADERS });

  const service = createServiceClient();
  const { data: site } = await service
    .from("sites")
    .select("id, org_id")
    .eq("site_id", parsed.data.siteId)
    .maybeSingle();
  // Unknown sites are dropped silently — this endpoint reveals nothing.
  if (site) {
    await service.from("usage_events").insert({
      site_id: site.id,
      org_id: site.org_id,
      event: parsed.data.event,
      data: { ...parsed.data.data, loader: parsed.data.loader } as never,
    });
  }
  return new Response(null, { status: 202, headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
