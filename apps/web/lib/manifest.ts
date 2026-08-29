import "server-only";
import {
  ActionContractSchema,
  ToolManifestSchema,
  MANIFEST_VERSION,
  type ActionContract,
  type SignedManifest,
  type ToolManifest,
} from "@sodium/contracts";
import { signManifest } from "@sodium/contracts/signing";
import { manifestSigningKey } from "./env";
import { createServiceClient } from "./supabase/service";
import { projectTools } from "./project-tools";

export interface PublishResult {
  ok: boolean;
  manifestId?: string;
  version?: number;
  error?: string;
}

/**
 * Atomically publishes the site's approved contracts as a new signed manifest
 * version. Caller MUST have verified the user is an owner/admin of the site's
 * organization; this function performs signing (server-only key) and defers
 * atomicity + lineage checks to the publish_manifest RPC.
 */
export async function publishSiteManifest(
  siteUuid: string,
  performedBy: string,
): Promise<PublishResult> {
  const service = createServiceClient();

  const { data: site, error: siteError } = await service
    .from("sites")
    .select("id, site_id, allowed_origins, org_id")
    .eq("id", siteUuid)
    .single();
  if (siteError || !site) return { ok: false, error: "site not found" };

  const { data: contractRows, error: contractsError } = await service
    .from("tool_contracts")
    .select(
      "latest_version_id, contract_versions!tool_contracts_latest_version_id_fkey(contract)",
    )
    .eq("site_id", siteUuid)
    .eq("status", "active")
    .order("name");
  if (contractsError) return { ok: false, error: contractsError.message };

  const parsedContracts = (contractRows ?? []).map((row) =>
    ActionContractSchema.safeParse(
      (row.contract_versions as unknown as { contract?: unknown } | null)
        ?.contract,
    ),
  );
  if (parsedContracts.some((result) => !result.success)) {
    return {
      ok: false,
      error:
        "One or more enabled tools use a retired contract. Run analysis again.",
    };
  }
  const contracts = parsedContracts.map(
    (result) => (result as { success: true; data: ActionContract }).data,
  );
  const { data: latest } = await service
    .from("manifests")
    .select("version")
    .eq("site_id", siteUuid)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = (latest?.version ?? 0) + 1;

  const manifest: ToolManifest = ToolManifestSchema.parse({
    manifestVersion: MANIFEST_VERSION,
    siteId: site.site_id,
    origins: site.allowed_origins,
    version: nextVersion,
    generatedAt: new Date().toISOString(),
    tools: projectTools(contracts),
  });
  const signed: SignedManifest = signManifest(manifest, manifestSigningKey());

  const { data: manifestId, error } = await service.rpc("publish_manifest", {
    p_site_id: siteUuid,
    p_manifest: manifest as never,
    p_signed: signed as never,
    p_performed_by: performedBy,
    p_action: "publish",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, manifestId: manifestId as string, version: nextVersion };
}

/** One-click rollback: re-signs a previous version's content as a new version. */
export async function rollbackSiteManifest(
  siteUuid: string,
  sourceManifestId: string,
  performedBy: string,
): Promise<PublishResult> {
  const service = createServiceClient();

  const { data: source, error: sourceError } = await service
    .from("manifests")
    .select("id, manifest, site_id, signed")
    .eq("id", sourceManifestId)
    .eq("site_id", siteUuid)
    .single();
  if (sourceError || !source)
    return { ok: false, error: "source manifest not found" };
  if (!source.signed)
    return {
      ok: false,
      error: "cannot roll back to a draft (unsigned) manifest",
    };

  const { data: latest } = await service
    .from("manifests")
    .select("version")
    .eq("site_id", siteUuid)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = (latest?.version ?? 0) + 1;

  const content = ToolManifestSchema.parse({
    ...(source.manifest as unknown as ToolManifest),
    version: nextVersion,
    generatedAt: new Date().toISOString(),
  });
  const signed = signManifest(content, manifestSigningKey());

  const { data: manifestId, error } = await service.rpc("publish_manifest", {
    p_site_id: siteUuid,
    p_manifest: content as never,
    p_signed: signed as never,
    p_performed_by: performedBy,
    p_action: "rollback",
    p_source_manifest_id: sourceManifestId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, manifestId: manifestId as string, version: nextVersion };
}
