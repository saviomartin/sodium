import { SITE_ID_PATTERN } from "@sodium/contracts";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Public manifest endpoint consumed by the loader. Serves only the currently
 * PUBLISHED, SIGNED envelope — drafts never appear here. The payload is
 * signed and origin-bound, so it is safe to serve with permissive CORS.
 */

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  // Settings change only on an explicit publish. Always revalidate here so a
  // republish takes effect on the very next loader request.
  "cache-control": "no-store",
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  if (!SITE_ID_PATTERN.test(siteId)) {
    return Response.json(
      { error: "invalid site id" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const service = createServiceClient();
  const { data: site } = await service
    .from("sites")
    .select("id, current_manifest_id, repository_id")
    .eq("site_id", siteId)
    .maybeSingle();
  if (!site?.current_manifest_id) {
    return Response.json(
      { error: "no published manifest" },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  const { data: billing } = await service
    .from("repository_billing")
    .select("status")
    .eq("repository_id", site.repository_id)
    .maybeSingle();
  if (!billing || !["active", "trialing", "past_due"].includes(billing.status)) {
    return Response.json(
      { error: "repository subscription required" },
      { status: 402, headers: CORS_HEADERS },
    );
  }

  const { data: manifest } = await service
    .from("manifests")
    .select("signed, status")
    .eq("id", site.current_manifest_id)
    .maybeSingle();
  if (!manifest?.signed || manifest.status !== "published") {
    return Response.json(
      { error: "no published manifest" },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  return Response.json(manifest.signed, { headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
