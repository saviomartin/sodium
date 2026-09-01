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
        .join(", ")}); set Application root to one of these paths`,
    );
  }
}

export function detectReactProjects(
  workspace: RepoWorkspace,
): ReactProjectDetection[] {
  const files = workspace.listFiles();
  const fileSet = new Set(files);
  const sourceFiles = files.filter((file) =>
    /\.(tsx|jsx|ts|js|mjs)$/.test(file),
  );
  const candidates = new Map<string, Candidate>();
  const manifests = new Map<string, PackageJson>();

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
    manifests.set(packagePath, manifest);
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
    addCandidate(
      candidates,
      candidateForRoot(workspace, fileSet, sourceFiles, projectRoot, manifest),
    );
  }

  // Integrated Nx workspaces commonly keep React and Vite dependencies in the
  // root manifest while applications live under apps/* without package.json.
  for (const projectRoot of detectConfiguredViteRoots(workspace, files)) {
    const manifest = nearestReactManifest(projectRoot, manifests);
    if (!manifest) continue;
    addCandidate(
      candidates,
      candidateForRoot(
        workspace,
        fileSet,
        sourceFiles,
        projectRoot,
        manifest,
        "Vite",
      ),
    );
  }

  const allCandidates = [...candidates.values()];
  const independent = allCandidates.filter(
    (candidate) =>
      !candidate.entryFiles.every((entry) =>
        allCandidates.some(
          (nested) =>
            nested !== candidate &&
            isDescendant(nested.projectRoot, candidate.projectRoot) &&
            isWithin(entry, nested.projectRoot),
        ),
      ),
  );
  independent.sort(
    (a, b) =>
      b.score - a.score ||
      depth(a.projectRoot) - depth(b.projectRoot) ||
      a.projectRoot.localeCompare(b.projectRoot),
  );
  return independent.map((candidate) => ({
    framework: candidate.framework,
    projectRoot: candidate.projectRoot,
    detail: candidate.detail,
    entryFiles: candidate.entryFiles,
    buildTool: candidate.buildTool,
  }));
}

export function detectReactProject(
  workspace: RepoWorkspace,
): ReactProjectDetection | null {
  const projects = detectReactProjects(workspace);
  if (projects.length > 1) {
    throw new AmbiguousReactProjectError(
      projects.map((candidate) => candidate.projectRoot),
    );
  }
  return projects[0] ?? null;
}

function candidateForRoot(
  workspace: RepoWorkspace,
  fileSet: Set<string>,
  sourceFiles: string[],
  projectRoot: string,
  manifest: PackageJson,
  forcedBuildTool?: string,
): Candidate | null {
  const dependencies = {
    ...manifest.peerDependencies,
    ...manifest.devDependencies,
    ...manifest.dependencies,
  };
  if (
    !dependencies.react ||
    !dependencies["react-dom"] ||
    (!forcedBuildTool && dependencies.next)
  ) {
    return null;
  }
  const projectFiles = sourceFiles.filter((file) =>
    isWithin(file, projectRoot),
  );
  const entryFiles = detectEntryFiles(
    workspace,
    fileSet,
    projectRoot,
    projectFiles,
    manifest,
  );
  const buildTool =
    forcedBuildTool ?? detectBuildTool(dependencies, manifest.scripts ?? {});
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
    (!hasIndexHtml && !hasBuildEvidence && !hasDomEntry) ||
    (Boolean(forcedBuildTool) && !hasIndexHtml && !hasDomEntry)
  ) {
    return null;
  }
  const relative = (file: string) => relativeToRoot(projectRoot, file);
  const score =
    (hasDomEntry ? 8 : 0) +
    (hasIndexHtml ? 4 : 0) +
    (hasBuildEvidence ? 3 : 0) +
    (entryFiles.some((file) => relative(file).startsWith("src/")) ? 1 : 0);
  return {
    framework: "react",
    projectRoot,
    buildTool,
    entryFiles,
    score,
    detail: `${buildTool === "custom" ? "React" : `${buildTool} React`} app (${projectRoot || "."})`,
  };
}

function addCandidate(
  candidates: Map<string, Candidate>,
  candidate: Candidate | null,
): void {
  if (!candidate) return;
  const current = candidates.get(candidate.projectRoot);
  if (!current || candidate.score > current.score) {
    candidates.set(candidate.projectRoot, candidate);
  }
}

function detectConfiguredViteRoots(
  workspace: RepoWorkspace,
  files: string[],
): string[] {
  const roots = new Set<string>();
  for (const file of files) {
    if (/(?:^|\/)vite\.config\.(?:js|mjs|cjs|ts|mts|cts)$/.test(file)) {
      roots.add(posix.dirname(file) === "." ? "" : posix.dirname(file));
      continue;
    }
    if (!file.endsWith("/project.json") && file !== "project.json") continue;
    const source = workspace.readFile(file);
    if (
      !source ||
      !/(?:@nx\/vite|@nrwl\/vite):(?:build|dev-server)/.test(source)
    ) {
      continue;
    }
    roots.add(posix.dirname(file) === "." ? "" : posix.dirname(file));
  }
  return [...roots].sort();
}

function nearestReactManifest(
  projectRoot: string,
  manifests: Map<string, PackageJson>,
): PackageJson | null {
  const segments = projectRoot ? projectRoot.split("/") : [];
  for (let index = segments.length; index >= 0; index--) {
    const root = segments.slice(0, index).join("/");
    const manifest = manifests.get(atRoot(root, "package.json"));
    if (!manifest) continue;
    const dependencies = {
      ...manifest.peerDependencies,
      ...manifest.devDependencies,
      ...manifest.dependencies,
    };
    if (dependencies.react && dependencies["react-dom"]) {
      return manifest;
    }
  }
  return null;
}

function isWithin(path: string, root: string): boolean {
  return !root || path === root || path.startsWith(`${root}/`);
}

function isDescendant(path: string, root: string): boolean {
  return path !== root && (!root || path.startsWith(`${root}/`));
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
