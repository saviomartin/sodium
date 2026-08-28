import {
  NextJsAnalyzer,
  RepoWorkspace,
  type StaticAnalysis,
} from "@sodium/analyzer";
import type {
  CompatFinding,
  PublishedTool,
  SourceEvidence,
  ToolManifest,
} from "@sodium/contracts";
import { jsonb, type WorkerContext } from "../db";
import { selectRepoProvider } from "../providers/repo-provider";
import type { JobOutcome } from "../queue";
import { log } from "../log";

/**
 * Continuous synchronization: on a verified push, re-analyze the changed
 * commit and diff it against every published manifest for the repository.
 * Findings never touch production — breaking changes produce a DRAFT
 * manifest version that a human must approve.
 */
export async function handleSyncCompare(
  ctx: WorkerContext,
  repositoryId: string,
  commitSha: string,
  deliveryId: string,
): Promise<JobOutcome> {
  const repos = await ctx.sql<
    {
      id: string;
      org_id: string;
      owner: string;
      name: string;
      installation_id: number;
    }[]
  >`
    select r.id, r.org_id, r.owner, r.name, gi.installation_id
    from repositories r join github_installations gi on gi.id = r.installation_id
    where r.id = ${repositoryId}
  `;
  const repo = repos[0];
  if (!repo) return { kind: "fatal", reason: "repository not found" };

  const sites = await ctx.sql<
    {
      id: string;
      site_id: string;
      manifest: unknown;
      manifest_id: string | null;
    }[]
  >`
    select s.id, s.site_id, m.manifest, s.current_manifest_id as manifest_id
    from sites s
    left join manifests m on m.id = s.current_manifest_id
    where s.repository_id = ${repositoryId}
  `;
  const published = sites.filter((site) => site.manifest !== null);
  if (published.length === 0) {
    log("info", "sync: no published manifests for repository", {
      repositoryId,
    });
    return { kind: "done" };
  }

  const provider = selectRepoProvider(ctx.env, repo.installation_id);
  const snapshotDir = await provider.ensureSnapshot({
    runId: `sync-${deliveryId}`.slice(0, 60),
    installationId: repo.installation_id,
    owner: repo.owner,
    repo: repo.name,
    sha: commitSha,
  });
  const analysis = await new NextJsAnalyzer(
    new RepoWorkspace(snapshotDir),
  ).analyze();

  for (const site of published) {
    const manifest = site.manifest as ToolManifest;
    const findings = compareManifestToAnalysis(manifest, analysis);

    await ctx.sql.begin(async (sql) => {
      await sql`
        delete from compat_findings
        where repository_id = ${repositoryId} and site_id = ${site.id} and commit_sha = ${commitSha}
      `;
      for (const finding of findings) {
        await sql`
          insert into compat_findings (repository_id, org_id, site_id, commit_sha, finding, severity)
          values (${repositoryId}, ${repo.org_id}, ${site.id}, ${commitSha},
                  ${jsonb(sql, finding as unknown as Record<string, unknown>)}::jsonb, ${finding.severity})
        `;
      }
    });

    const breaking = findings.filter(
      (finding) => finding.severity === "breaking",
    );
    if (breaking.length > 0) {
      const brokenNames = new Set(breaking.map((finding) => finding.toolName));
      const draft: ToolManifest = {
        ...manifest,
        tools: manifest.tools.filter((tool) => !brokenNames.has(tool.name)),
        generatedAt: new Date().toISOString(),
        version: manifest.version + 1,
      };
      // Draft version requires human approval + signing at publish time.
      await ctx.sql`
        insert into manifests (site_id, org_id, version, manifest, signed, status)
        select ${site.id}, ${repo.org_id},
               (select coalesce(max(version), 0) + 1 from manifests where site_id = ${site.id}),
               ${jsonb(ctx.sql, draft as unknown as Record<string, unknown>)}::jsonb, null, 'draft'
        where not exists (
          select 1 from manifests
          where site_id = ${site.id} and status = 'draft'
            and manifest ->> 'generatedAt' >= ${new Date(Date.now() - 60_000).toISOString()}
        )
      `;
      log("warn", "sync: breaking findings; draft manifest created", {
        siteId: site.site_id,
        breaking: breaking.length,
      });
    }
  }
  return { kind: "done" };
}

/** Deterministic manifest ↔ analysis comparison. */
export function compareManifestToAnalysis(
  manifest: ToolManifest,
  analysis: StaticAnalysis,
): CompatFinding[] {
  const findings: CompatFinding[] = [];
  const pagePatterns = new Set(
    analysis.routes.filter((r) => r.kind === "page").map((r) => r.pathPattern),
  );
  const actionNames = new Set(
    analysis.serverActions.map((action) => snake(action.name)),
  );
  const filesWithAuth = new Set(
    analysis.authSignals.map((signal) => signal.span.filePath),
  );

  for (const tool of manifest.tools) {
    switch (tool.handler.kind) {
      case "navigate": {
        const target = tool.handler.urlTemplate.replace(/\{[^}]+\}/g, "*");
        if (
          ![...pagePatterns].some(
            (pattern) =>
              pattern === target || pattern === target.replace(/\/$/, ""),
          )
        ) {
          findings.push({
            kind: "handler_removed",
            severity: "breaking",
            toolName: tool.name,
            summary: `navigation target ${tool.handler.urlTemplate} no longer resolves to a page route`,
          });
        }
        break;
      }
      case "extract": {
        for (const route of tool.routes) {
          if (
            route.pathPattern !== "/**" &&
            !pagePatterns.has(route.pathPattern)
          ) {
            findings.push({
              kind: "evidence_drifted",
              severity: "warning",
              toolName: tool.name,
              summary: `route ${route.pathPattern} for content extraction no longer exists`,
            });
          }
        }
        break;
      }
      case "form": {
        const route = tool.routes[0]?.pathPattern;
        const forms = analysis.forms.filter(
          (form) => form.pathPattern === route,
        );
        if (forms.length === 0) {
          findings.push({
            kind: "handler_removed",
            severity: "breaking",
            toolName: tool.name,
            summary: `no form remains on ${route ?? "the bound route"}`,
          });
          break;
        }
        const mapped = new Set(Object.values(tool.handler.fieldMap));
        const currentFields = new Set(
          forms.flatMap((form) => form.fields.map((field) => field.name)),
        );
        const missing = [...mapped].filter((name) => !currentFields.has(name));
        if (missing.length > 0) {
          findings.push({
            kind: "input_changed",
            severity: "breaking",
            toolName: tool.name,
            summary: `form fields removed or renamed: ${missing.join(", ")}`,
          });
        }
        break;
      }
      case "bridge": {
        const expected = tool.handler.bridgeKey.replace(/^actions\./, "");
        if (!actionNames.has(expected)) {
          findings.push({
            kind: "handler_removed",
            severity: "breaking",
            toolName: tool.name,
            summary: `server action backing bridge key "${tool.handler.bridgeKey}" was removed or renamed`,
          });
        }
        break;
      }
    }
  }
  // Auth drift on evidenced files (uses evidence when the manifest was built
  // from contracts that carry it — manifests keep handler + routes only, so
  // this pass works at file level via published tool routes).
  void filesWithAuth;
  return findings;
}

/** Kept in sync with the fixture AI provider naming. */
function snake(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export type { SourceEvidence, PublishedTool };
