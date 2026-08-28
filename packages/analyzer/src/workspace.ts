import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, lstatSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ignore, { type Ignore } from "ignore";

/**
 * Read-only view over an extracted repository snapshot. Enforces the trust
 * boundary for repository contents:
 *  - never executes anything, never follows symlinks
 *  - excludes secrets, env files, dependencies, build output and ignored paths
 *  - honors .gitignore plus a repository-level .sodiumignore
 *  - caps per-file and total bytes read
 */

export const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
export const DEFAULT_MAX_TOTAL_BYTES = 64 * 1024 * 1024;
export const DEFAULT_MAX_FILES = 20_000;

/** Paths that are never analyzed regardless of ignore files. */
const BUILT_IN_EXCLUDES = [
  ".git/",
  "node_modules/",
  ".next/",
  ".turbo/",
  ".vercel/",
  "dist/",
  "build/",
  "out/",
  "coverage/",
  ".cache/",
  // Secrets and credentials — excluded defensively even if committed.
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "*.keystore",
  "id_rsa*",
  "id_ecdsa*",
  "id_ed25519*",
  "*.crt",
  "secrets.*",
  // Generated / vendored noise.
  "*.min.js",
  "*.map",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  ".DS_Store",
];

const ANALYZABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".mdx",
  ".css",
]);

export interface WorkspaceOptions {
  maxFileBytes?: number;
  maxTotalBytes?: number;
  maxFiles?: number;
}

export class RepoWorkspace {
  private readonly matcher: Ignore;
  private readonly maxFileBytes: number;
  private readonly maxTotalBytes: number;
  private readonly maxFiles: number;
  private cachedFiles: string[] | null = null;
  private totalBytesRead = 0;
  readonly skipped: string[] = [];

  constructor(
    readonly rootDir: string,
    options: WorkspaceOptions = {},
  ) {
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    this.maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
    this.maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
    this.matcher = ignore().add(BUILT_IN_EXCLUDES);
    for (const ignoreFile of [".gitignore", ".sodiumignore"]) {
      const content = this.tryReadRaw(
        join(/* turbopackIgnore: true */ rootDir, ignoreFile),
      );
      if (content !== null) this.matcher.add(content);
    }
  }

  /** All analyzable file paths, relative to the root, POSIX-separated. */
  listFiles(): string[] {
    if (this.cachedFiles) return this.cachedFiles;
    const files: string[] = [];
    const walk = (dir: string) => {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (files.length >= this.maxFiles) return;
        const absolute = join(dir, entry);
        let stats;
        try {
          stats = lstatSync(absolute);
        } catch {
          continue;
        }
        if (stats.isSymbolicLink()) {
          this.skipped.push(
            this.toPosix(relative(this.rootDir, absolute)) + " (symlink)",
          );
          continue;
        }
        const rel = this.toPosix(relative(this.rootDir, absolute));
        if (stats.isDirectory()) {
          if (this.matcher.ignores(rel + "/")) continue;
          walk(absolute);
        } else if (stats.isFile()) {
          if (this.matcher.ignores(rel)) continue;
          files.push(rel);
        }
      }
    };
    walk(this.rootDir);
    files.sort();
    this.cachedFiles = files;
    return files;
  }

  /** Files with extensions the static analyzer parses. */
  listSourceFiles(): string[] {
    return this.listFiles().filter((f) => {
      const dot = f.lastIndexOf(".");
      return dot >= 0 && ANALYZABLE_EXTENSIONS.has(f.slice(dot));
    });
  }

  /**
   * Read a file's text, or null when missing, oversized, binary-looking, or
   * over the total read budget.
   */
  readFile(relPath: string): string | null {
    const absolute = join(this.rootDir, ...relPath.split("/"));
    let stats;
    try {
      stats = statSync(absolute);
    } catch {
      return null;
    }
    if (stats.size > this.maxFileBytes) {
      this.skipped.push(
        `${relPath} (${stats.size} bytes exceeds per-file cap)`,
      );
      return null;
    }
    if (this.totalBytesRead + stats.size > this.maxTotalBytes) {
      this.skipped.push(`${relPath} (total read budget exhausted)`);
      return null;
    }
    const content = this.tryReadRaw(absolute);
    if (content === null) return null;
    if (content.includes("\u0000")) {
      this.skipped.push(`${relPath} (binary)`);
      return null;
    }
    this.totalBytesRead += stats.size;
    return content;
  }

  get bytesRead(): number {
    return this.totalBytesRead;
  }

  private tryReadRaw(absolutePath: string): string | null {
    try {
      return readFileSync(absolutePath, "utf8");
    } catch {
      return null;
    }
  }

  private toPosix(p: string): string {
    return sep === "/" ? p : p.split(sep).join("/");
  }
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Stable action id derived from immutable source coordinates. */
export function stableActionId(...parts: string[]): string {
  return `act_${sha256Hex(parts.join("")).slice(0, 16)}`;
}

/** Truncate an excerpt for evidence storage without splitting surrogate pairs. */
export function excerptOf(text: string, maxLength = 1500): string {
  if (text.length <= maxLength) return text;
  return `${[...text.slice(0, maxLength)].join("")}\n/* … truncated */`;
}
