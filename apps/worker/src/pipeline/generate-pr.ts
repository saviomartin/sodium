import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ActionContract } from "@sodium/contracts";
import { jsonb, type WorkerContext } from "../db";
import { selectRepoProvider } from "../providers/repo-provider";
import { generateIntegration } from "../prgen/generator";
import type { JobOutcome } from "../queue";
import { log } from "../log";

/**
 * Generates the reviewable integration PR for a site's approved contracts.
 * Never pushes to the default branch; all files are @generated-marked.
 */
export async function handleGeneratePr(
  ctx: WorkerContext,
  publicationId: string,
): Promise<JobOutcome> {
  const rows = await ctx.sql<
    {
      id: string;
      org_id: string;
      site_uuid: string;
      site_public_id: string;
      repository_id: string;
      owner: string;
      name: string;
      default_branch: string;
      installation_id: number;
      branch: string;
    }[]
  >`
    select pr.id, pr.org_id, s.id as site_uuid, s.site_id as site_public_id,
           r.id as repository_id, r.owner, r.name, r.default_branch, gi.installation_id, pr.branch
    from integration_prs pr
    join sites s on s.id = pr.site_id
    join repositories r on r.id = pr.repository_id
    join github_installations gi on gi.id = r.installation_id
    where pr.id = ${publicationId}
  `;
  const publication = rows[0];
  if (!publication)
    return { kind: "fatal", reason: "integration_pr row not found" };

  const contractRows = await ctx.sql<{ contract: unknown }[]>`
    select cv.contract
    from tool_contracts tc
    join contract_versions cv on cv.id = tc.latest_version_id
    where tc.site_id = ${publication.site_uuid} and tc.status = 'active'
  `;
  const contracts = contractRows.map((row) => row.contract as ActionContract);
  if (contracts.length === 0) {
    await markPr(ctx, publication.id, "failed", {
      message: "no approved contracts for site",
    });
    return { kind: "fatal", reason: "no approved contracts" };
  }

  try {
    const provider = selectRepoProvider(ctx.env, publication.installation_id);
    const sha = "0".repeat(40); // fixture provider ignores; GitHub provider snapshots by branch head below
    const snapshotDir = await provider.ensureSnapshot({
      runId: `prgen-${publication.id}`.slice(0, 60),
      installationId: publication.installation_id,
      owner: publication.owner,
      repo: publication.name,
      sha,
    });

    const layoutPath = [
      "app/layout.tsx",
      "src/app/layout.tsx",
      "app/layout.jsx",
    ].find((candidate) => existsSync(join(snapshotDir, candidate)));
    const layoutSource = layoutPath
      ? readFileSync(join(snapshotDir, layoutPath), "utf8")
      : null;

    const loaderOrigin = process.env.SITE_URL ?? "http://localhost:3000";
    const generated = generateIntegration({
      siteId: publication.site_public_id,
      loaderOrigin,
      contracts,
      layoutPath: layoutPath ?? null,
      layoutSource,
    });

    const result = await provider.createPullRequest({
      installationId: publication.installation_id,
      owner: publication.owner,
      repo: publication.name,
      baseBranch: publication.default_branch,
      branch: generated.branch,
      title: generated.title,
      body: generated.body,
      files: generated.files,
    });

    await ctx.sql`
      update integration_prs
      set status = 'open', pr_number = ${result.prNumber}, url = ${result.url},
          branch = ${generated.branch}, updated_at = now(), error = null
      where id = ${publication.id}
    `;
    log("info", "integration PR generated", { publicationId, url: result.url });
    return { kind: "done" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PR generation failed";
    await markPr(ctx, publication.id, "failed", { message });
    return { kind: "retry", reason: message };
  }
}

async function markPr(
  ctx: WorkerContext,
  id: string,
  status: "failed" | "open",
  error: Record<string, unknown> | null,
): Promise<void> {
  await ctx.sql`
    update integration_prs
    set status = ${status}, error = ${error ? jsonb(ctx.sql, error) : null}, updated_at = now()
    where id = ${id}
  `;
}
