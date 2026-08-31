import type { RepoWorkspace } from "../workspace";
import { posix } from "node:path";

const ENTRY_BASENAMES = ["main", "index", "client", "app"];
const ENTRY_EXTENSIONS = ["tsx", "jsx", "ts", "js", "mjs"];

export interface ReactProjectDetection {
  framework: "react";
  projectRoot: string;
  detail: string;
  entryFiles: string[];
  buildTool: string;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  source?: string | string[];
  browser?: string | Record<string, string>;
}

interface Candidate extends ReactProjectDetection {
  score: number;
}

export class AmbiguousReactProjectError extends Error {
  constructor(readonly projectRoots: string[]) {
    super(
      `multiple React applications were found (${projectRoots
        .map((root) => root || ".")
        .join(", ")}); connect a repository containing one web application`,
    );
  }
}

export function detectReactProject(
  workspace: RepoWorkspace,
): ReactProjectDetection | null {
  const files = workspace.listFiles();
  const fileSet = new Set(files);
  const sourceFiles = files.filter((file) =>
    /\.(tsx|jsx|ts|js|mjs)$/.test(file),
  );
  const candidates: Candidate[] = [];

  for (const packagePath of files.filter(
    (file) => file === "package.json" || file.endsWith("/package.json"),
  )) {
    const text = workspace.readFile(packagePath);
    if (!text) continue;
    let manifest: PackageJson;
    try {
      manifest = JSON.parse(text) as PackageJson;
    } catch {
      continue;
    }
    const dependencies = {
      ...manifest.peerDependencies,
      ...manifest.devDependencies,
      ...manifest.dependencies,
    };
    if (!dependencies.react || dependencies.next) continue;
    if (!dependencies["react-dom"]) continue;

    const projectRoot =
      packagePath === "package.json"
        ? ""
        : packagePath.slice(0, -"/package.json".length);
    const withinRoot = (file: string) =>
      projectRoot ? file.startsWith(projectRoot + "/") : true;
    const relative = (file: string) =>
      projectRoot ? file.slice(projectRoot.length + 1) : file;
    const projectFiles = sourceFiles.filter(withinRoot);
    const entryFiles = detectEntryFiles(
      workspace,
      fileSet,
      projectRoot,
      projectFiles,
      manifest,
    );
    const buildTool = detectBuildTool(dependencies, manifest.scripts ?? {});
    const hasIndexHtml = fileSet.has(atRoot(projectRoot, "index.html"));
    const hasBuildEvidence = buildTool !== "custom";
    const hasDomEntry = entryFiles.some((file) => {
      const source = workspace.readFile(file);
      return Boolean(
        source &&
        /(?:react-dom(?:\/client)?|createRoot\s*\(|hydrateRoot\s*\(|ReactDOM\.render\s*\()/.test(
          source,
        ),
      );
    });
    if (
      entryFiles.length === 0 ||
      (!hasIndexHtml && !hasBuildEvidence && !hasDomEntry)
    ) {
      continue;
    }

    const score =
      (hasDomEntry ? 8 : 0) +
      (hasIndexHtml ? 4 : 0) +
      (hasBuildEvidence ? 3 : 0) +
      (entryFiles.some((file) => relative(file).startsWith("src/")) ? 1 : 0);
    candidates.push({
      framework: "react",
      projectRoot,
      buildTool,
      entryFiles,
      score,
      detail: `${buildTool === "custom" ? "React" : `${buildTool} React`} app (${projectRoot || "."})`,
    });
  }

  if (candidates.length === 0) return null;
  const independent = candidates.filter(
    (candidate) =>
      !candidates.some(
        (nested) =>
          nested !== candidate &&
          nested.projectRoot.startsWith(
            candidate.projectRoot ? candidate.projectRoot + "/" : "",
          ) &&
          candidate.entryFiles.every(
            (entry) =>
              entry === nested.projectRoot ||
              entry.startsWith(nested.projectRoot + "/"),
          ),
      ),
  );
  independent.sort(
    (a, b) =>
      b.score - a.score ||
      depth(a.projectRoot) - depth(b.projectRoot) ||
      a.projectRoot.localeCompare(b.projectRoot),
  );
  if (independent.length > 1) {
    throw new AmbiguousReactProjectError(
      independent.map((candidate) => candidate.projectRoot),
    );
  }
  const selected = independent[0]!;
  return {
    framework: selected.framework,
    projectRoot: selected.projectRoot,
    detail: selected.detail,
    entryFiles: selected.entryFiles,
    buildTool: selected.buildTool,
  };
}

function detectEntryFiles(
  workspace: RepoWorkspace,
  files: Set<string>,
  projectRoot: string,
  projectFiles: string[],
  manifest: PackageJson,
): string[] {
  const entries = new Set<string>();
  const addIfPresent = (relative: string) => {
    const path = atRoot(projectRoot, relative.replace(/^\.\//, ""));
    if (files.has(path) && /\.(tsx|jsx|ts|js|mjs)$/.test(path)) {
      entries.add(path);
    }
  };
  const addHtmlScripts = (htmlPath: string) => {
    if (!files.has(htmlPath)) return;
    const html = workspace.readFile(htmlPath) ?? "";
    for (const match of html.matchAll(
      /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
    )) {
      const source = match[1];
      if (!source || /^(?:https?:)?\/\//.test(source)) continue;
      const relative = source.startsWith("/")
        ? source.slice(1)
        : posix.join(
            posix.dirname(relativeToRoot(projectRoot, htmlPath)),
            source,
          );
      addIfPresent(relative);
    }
  };

  const declared = [manifest.source, manifest.browser].flatMap((value) =>
    typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value
        : value && typeof value === "object"
          ? Object.values(value)
          : [],
  );
  for (const value of declared) {
    const relative = value.replace(/^\.\//, "");
    if (relative.endsWith(".html")) {
      addHtmlScripts(atRoot(projectRoot, relative));
    } else {
      addIfPresent(relative);
    }
  }

  const indexPath = atRoot(projectRoot, "index.html");
  addHtmlScripts(indexPath);

  for (const directory of ["src", "app", ""]) {
    for (const basename of ENTRY_BASENAMES) {
      for (const extension of ENTRY_EXTENSIONS) {
        addIfPresent(
          [directory, `${basename}.${extension}`].filter(Boolean).join("/"),
        );
      }
    }
  }

  if (entries.size === 0) {
    for (const file of projectFiles.slice(0, 2_000)) {
      const source = workspace.readFile(file);
      if (
        source &&
        /(?:from\s+["']react-dom(?:\/client)?["']|createRoot\s*\(|hydrateRoot\s*\(|ReactDOM\.render\s*\()/.test(
          source,
        )
      ) {
        entries.add(file);
      }
    }
  }
  return [...entries].sort();
}

function detectBuildTool(
  dependencies: Record<string, string>,
  scripts: Record<string, string>,
): string {
  const commands = Object.values(scripts).join("\n");
  if (dependencies.vite || /\bvite\b/.test(commands)) return "Vite";
  if (dependencies["react-scripts"] || /\breact-scripts\b/.test(commands)) {
    return "Create React App";
  }
  if (dependencies["@rsbuild/core"] || /\brsbuild\b/.test(commands)) {
    return "Rsbuild";
  }
  if (dependencies.parcel || /\bparcel\b/.test(commands)) return "Parcel";
  if (dependencies.webpack || /\bwebpack\b/.test(commands)) return "Webpack";
  return "custom";
}

function atRoot(projectRoot: string, relative: string): string {
  return projectRoot ? `${projectRoot}/${relative}` : relative;
}

function relativeToRoot(projectRoot: string, path: string): string {
  return projectRoot ? path.slice(projectRoot.length + 1) : path;
}

function depth(path: string): number {
  return path ? path.split("/").length : 0;
}
