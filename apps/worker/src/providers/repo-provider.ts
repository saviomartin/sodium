import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extract } from "tar";
import type { WorkerEnv } from "../env";
import type { WorkerContext } from "../db";
import { GithubOauthClient } from "./github";

/**
 * Repository access provider. `ensureSnapshot` materializes the source of one
 * commit into an isolated scratch directory WITHOUT executing repository code
 * (tarball extraction with entry filtering; no git, no hooks, no symlinks).
 */
export interface RepoProvider {
  resolveHeadSha(spec: RepoHeadSpec): Promise<string>;
  ensureSnapshot(spec: RepoSnapshotSpec): Promise<string>;
}

export interface RepoHeadSpec {
  connectionId: string;
  owner: string;
  repo: string;
  ref: string;
}

export interface RepoSnapshotSpec {
  runId: string;
  connectionId: string;
  owner: string;
  repo: string;
  sha: string;
}

const MAX_EXTRACTED_FILES = 20_000;
const MAX_ENTRY_BYTES = 10 * 1024 * 1024;

export class GithubRepoProvider implements RepoProvider {
  private readonly client: GithubOauthClient;

  constructor(
    private readonly env: WorkerEnv,
    client: GithubOauthClient,
  ) {
    this.client = client;
  }

  async resolveHeadSha(spec: RepoHeadSpec): Promise<string> {
    return this.client.resolveHeadSha(
      spec.connectionId,
      spec.owner,
      spec.repo,
      spec.ref,
    );
  }

  async ensureSnapshot(spec: RepoSnapshotSpec): Promise<string> {
    const target = snapshotDir(this.env, spec.runId, spec.sha);
    if (existsSync(join(target, ".sodium-complete"))) return target;
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });

    const tarball = await this.client.downloadTarball(
      spec.connectionId,
      spec.owner,
      spec.repo,
      spec.sha,
    );
    await extractTarballSafely(tarball, target);
    writeFileSync(join(target, ".sodium-complete"), spec.sha);
    return target;
  }
}

export function selectRepoProvider(
  ctx: Pick<WorkerContext, "env" | "supabase">,
): RepoProvider {
  return new GithubRepoProvider(ctx.env, new GithubOauthClient(ctx.supabase));
}

function snapshotDir(env: WorkerEnv, runId: string, sha: string): string {
  return join(env.WORK_DIR, "snapshots", `${runId}-${sha.slice(0, 12)}`);
}

/**
 * Extracts a tarball with hard limits: no symlinks/hardlinks, no absolute
 * paths or traversal, entry-count and per-entry size caps, and the top-level
 * `{owner}-{repo}-{sha}/` prefix stripped.
 */
export async function extractTarballSafely(
  tarball: Uint8Array,
  target: string,
): Promise<void> {
  let entries = 0;
  const source = join(
    tmpdir(),
    `sodium-tar-${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`,
  );
  writeFileSync(source, tarball);
  try {
    await extract({
      file: source,
      cwd: target,
      strip: 1,
      filter: (path, entry) => {
        entries++;
        if (entries > MAX_EXTRACTED_FILES) return false;
        const entryType = "type" in entry ? String(entry.type) : null;
        if (entryType !== "File" && entryType !== "Directory") return false; // no links, no devices
        const size =
          "size" in entry && typeof entry.size === "number" ? entry.size : 0;
        if (size > MAX_ENTRY_BYTES) return false;
        if (path.includes("..") || path.startsWith("/")) return false;
        return true;
      },
    });
  } finally {
    rmSync(source, { force: true });
  }
  if (readdirSync(target).length === 0) {
    throw new Error("tarball extraction produced no files");
  }
}
