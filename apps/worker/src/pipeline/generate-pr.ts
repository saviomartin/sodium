import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RepoWorkspace } from "@sodium/analyzer";
import { MAX_JOB_ATTEMPTS, type ActionContract } from "@sodium/contracts";
import { jsonb, type WorkerContext } from "../db";
import { selectRepoProvider } from "../providers/repo-provider";
import { generateIntegration, findInstallTarget } from "../prgen/generator";
import type { JobOutcome } from "../queue";
import { log } from "../log";

/**
 * Generates a reviewed integration PR. It installs the hosted loader and only
 * adds first-party bindings when approved server actions require them.
 */
export async function handleGeneratePr(
  ctx: WorkerContext,
  publicationId: string,
  attempt = 0,
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
      pr_number: number | null;
    }[]
  >`
    select pr.id, pr.org_id, s.id as site_uuid, s.site_id as site_public_id,
           r.id as repository_id, r.owner, r.name, r.default_branch, gi.installation_id,
           pr.branch, pr.pr_number
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
    const provider = selectRepoProvider(ctx.env);
    const sha = await provider.resolveHeadSha({
      installationId: publication.installation_id,
      owner: publication.owner,
      repo: publication.name,
      ref: publication.default_branch,
    });
    const snapshotDir = await provider.ensureSnapshot({
      runId: `prgen-${publication.id}`.slice(0, 60),
      installationId: publication.installation_id,
      owner: publication.owner,
      repo: publication.name,
      sha,
    });

    const snapshotFiles = new RepoWorkspace(snapshotDir).listFiles();
    const targetPath = findInstallTarget(snapshotFiles);
    if (!targetPath) {
      throw new Error(
        "Could not locate a supported document shell. Add the loader snippet manually, or use a root layout, _document, app/root, app.html, or index.html file.",
      );
    }
    const targetSource = readFileSync(join(snapshotDir, targetPath), "utf8");

    const generated = generateIntegration({
      siteId: publication.site_public_id,
      loaderOrigin: ctx.env.SODIUM_PUBLIC_URL.replace(/\/$/, ""),
      contracts,
      targetPath,
      targetSource,
    });

    if (generated.alreadyInstalled) {
      if (publication.pr_number) {
        await provider.closePullRequest({
          installationId: publication.installation_id,
          owner: publication.owner,
          repo: publication.name,
          prNumber: publication.pr_number,
        });
      }
      await ctx.sql`
        update integration_prs
        set status = 'merged', branch = ${generated.branch}, pr_number = null,
            url = null, updated_at = now(), error = null
        where id = ${publication.id}
      `;
      log("info", "loader already installed; PR not required", {
        publicationId,
        targetPath,
      });
      return { kind: "done" };
    }

    if (
      publication.pr_number &&
      publication.branch !== "pending" &&
      publication.branch !== generated.branch
    ) {
      await provider.closePullRequest({
        installationId: publication.installation_id,
        owner: publication.owner,
        repo: publication.name,
        prNumber: publication.pr_number,
      });
    }

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
    const message = describePrError(error);
    if (attempt < MAX_JOB_ATTEMPTS - 1) {
      await markPr(ctx, publication.id, "pending", {
        message: `Retrying: ${message}`,
      });
      return { kind: "retry", reason: message };
    }
    await markPr(ctx, publication.id, "failed", { message });
    return { kind: "fatal", reason: message };
  }
}

function describePrError(error: unknown): string {
  if (!(error instanceof Error)) return "PR generation failed";
  const status = (error as Error & { status?: number }).status;
  return status
    ? `GitHub request failed (${status}): ${error.message}`
    : error.message;
}

async function markPr(
  ctx: WorkerContext,
  id: string,
  status: "failed" | "open" | "pending",
  error: Record<string, unknown> | null,
): Promise<void> {
  await ctx.sql`
    update integration_prs
    set status = ${status}, error = ${error ? jsonb(ctx.sql, error) : null}, updated_at = now()
    where id = ${id}
  `;
}
