import {
  cpSync,
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
import { hasGithubCredentials } from "../env";
import { GithubAppClient } from "./github";
import { log } from "../log";

/**
 * Repository access provider. `ensureSnapshot` materializes the source of one
 * commit into an isolated scratch directory WITHOUT executing repository code
 * (tarball extraction with entry filtering; no git, no hooks, no symlinks).
 */
export interface RepoProvider {
  ensureSnapshot(spec: RepoSnapshotSpec): Promise<string>;
  createPullRequest(
    spec: PullRequestSpec,
  ): Promise<{ prNumber: number | null; url: string | null }>;
}

export interface RepoSnapshotSpec {
  runId: string;
  installationId: number;
  owner: string;
  repo: string;
  sha: string;
}

export interface PullRequestSpec {
  installationId: number;
  owner: string;
  repo: string;
  baseBranch: string;
  branch: string;
  title: string;
  body: string;
  files: { path: string; content: string }[];
}

const MAX_EXTRACTED_FILES = 20_000;
const MAX_ENTRY_BYTES = 10 * 1024 * 1024;

export class GithubRepoProvider implements RepoProvider {
  private readonly client: GithubAppClient;

  constructor(
    private readonly env: WorkerEnv,
    client?: GithubAppClient,
  ) {
    this.client = client ?? new GithubAppClient(env);
  }

  async ensureSnapshot(spec: RepoSnapshotSpec): Promise<string> {
    const target = snapshotDir(this.env, spec.runId, spec.sha);
    if (existsSync(join(target, ".sodium-complete"))) return target;
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });

    const tarball = await this.client.downloadTarball(
      spec.installationId,
      spec.owner,
      spec.repo,
      spec.sha,
    );
    await extractTarballSafely(tarball, target);
    writeFileSync(join(target, ".sodium-complete"), spec.sha);
    return target;
  }

  async createPullRequest(spec: PullRequestSpec) {
    const { prNumber, url } = await this.client.createPullRequest(spec);
    return { prNumber, url };
  }
}

/**
 * Fixture-backed provider used when GitHub credentials are absent or the
 * repository is the seeded local fixture (installation_id = 0). Snapshots
 * come from FIXTURE_REPO_DIR; "pull requests" are written to a local
 * directory so the full pipeline stays exercisable without credentials.
 */
export class LocalFixtureRepoProvider implements RepoProvider {
  constructor(private readonly env: WorkerEnv) {}

  async ensureSnapshot(spec: RepoSnapshotSpec): Promise<string> {
    const source = this.env.FIXTURE_REPO_DIR;
    if (!source || !existsSync(source)) {
      throw new Error(
        "FIXTURE_REPO_DIR is not configured; cannot snapshot the local fixture repository",
      );
    }
    const target = snapshotDir(this.env, spec.runId, spec.sha);
    if (existsSync(join(target, ".sodium-complete"))) return target;
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    cpSync(source, target, {
      recursive: true,
      filter: (src) => !src.includes("node_modules") && !src.includes(".next"),
    });
    writeFileSync(join(target, ".sodium-complete"), spec.sha);
    return target;
  }

  async createPullRequest(spec: PullRequestSpec) {
    const prDir = join(
      this.env.WORK_DIR,
      "local-prs",
      `${spec.repo}-${spec.branch}`.replace(/[^a-zA-Z0-9._-]/g, "_"),
    );
    rmSync(prDir, { recursive: true, force: true });
    for (const file of spec.files) {
      const filePath = join(prDir, file.path);
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(filePath, file.content);
    }
    writeFileSync(
      join(prDir, "PR_DESCRIPTION.md"),
      `# ${spec.title}\n\n${spec.body}\n`,
    );
    log("info", "local PR written (no GitHub credentials)", {
      prDir,
      files: spec.files.length,
    });
    return { prNumber: null, url: `file://${prDir}` };
  }
}

export function selectRepoProvider(
  env: WorkerEnv,
  installationId: number,
): RepoProvider {
  // Fixture installations use non-positive installation ids (see seed +
  // connectFixtureRepoAction); real GitHub ids are always positive.
  if (installationId <= 0 || !hasGithubCredentials(env)) {
    return new LocalFixtureRepoProvider(env);
  }
  return new GithubRepoProvider(env);
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
