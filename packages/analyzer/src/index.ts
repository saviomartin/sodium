export * from "./types";
export {
  RepoWorkspace,
  sha256Hex,
  stableActionId,
  excerptOf,
} from "./workspace";
export {
  NextJsAnalyzer,
  detectAppDir,
  detectAppDirs,
  projectRootForAppDir,
} from "./next/adapter";
export { ReactAnalyzer } from "./react/adapter";
export {
  AmbiguousReactProjectError,
  detectReactProject,
  detectReactProjects,
} from "./react/detection";
export { createReactHrefResolver, extractReactRoutes } from "./react/routes";
export { parseAppPath, routeFileKind } from "./next/routes";
export { detectAuthSignals } from "./shared/auth";

import { RepoWorkspace, type WorkspaceOptions } from "./workspace";
import {
  NextJsAnalyzer,
  detectAppDirs,
  projectRootForAppDir,
} from "./next/adapter";
import { ReactAnalyzer } from "./react/adapter";
import { detectReactProjects } from "./react/detection";
import type { FrameworkAnalyzer, StaticAnalysis } from "./types";

export interface AnalyzeRepoOptions extends WorkspaceOptions {
  projectRoot?: string | null;
}

/** Analyze a supported repository without executing any repository code. */
export async function analyzeRepo(
  rootDir: string,
  options?: AnalyzeRepoOptions,
): Promise<StaticAnalysis> {
  const workspace = new RepoWorkspace(rootDir, options);
  const analyzer = selectFrameworkAnalyzer(workspace, {
    projectRoot: options?.projectRoot,
  });
  if (!analyzer) {
    throw new UnsupportedFrameworkError(
      "unsupported repository: expected a Next.js App Router app or a browser React app with React DOM and a web entry point",
    );
  }
  return analyzer.analyze();
}

export function selectFrameworkAnalyzer(
  workspace: RepoWorkspace,
  options: { projectRoot?: string | null } = {},
): FrameworkAnalyzer | null {
  const nextProjects = detectAppDirs(workspace.listSourceFiles()).map(
    (appDir) => ({
      projectRoot: projectRootForAppDir(appDir),
      analyzer: () => new NextJsAnalyzer(workspace, appDir),
    }),
  );
  const reactProjects = detectReactProjects(workspace).map((detection) => ({
    projectRoot: detection.projectRoot,
    analyzer: () => new ReactAnalyzer(workspace, detection),
  }));
  const projects = [...nextProjects, ...reactProjects];
  const selected = options.projectRoot;
  if (selected !== undefined && selected !== null) {
    const normalized = selected === "." ? "" : selected;
    const matches = projects.filter(
      (project) => project.projectRoot === normalized,
    );
    if (matches.length === 1) return matches[0]!.analyzer();
    throw new SelectedProjectRootError(selected, projectRoots(projects));
  }
  if (projects.length > 1) {
    throw new AmbiguousProjectError(projectRoots(projects));
  }
  return projects[0]?.analyzer() ?? null;
}

export class UnsupportedFrameworkError extends Error {}

export class AmbiguousProjectError extends Error {
  constructor(readonly projectRoots: string[]) {
    super(
      `multiple web applications were found (${displayRoots(projectRoots)}); set Application root to one of these paths`,
    );
  }
}

export class SelectedProjectRootError extends Error {
  constructor(
    readonly projectRoot: string,
    readonly availableProjectRoots: string[],
  ) {
    super(
      availableProjectRoots.length > 0
        ? `Application root ${projectRoot} is not a supported web application; detected: ${displayRoots(availableProjectRoots)}`
        : `Application root ${projectRoot} is not a supported Next.js or browser React application`,
    );
  }
}

function projectRoots(projects: { projectRoot: string }[]): string[] {
  return [...new Set(projects.map((project) => project.projectRoot))].sort();
}

function displayRoots(roots: string[]): string {
  return roots.map((root) => root || ".").join(", ");
}

/** Framework-specific entry point retained for focused tests and callers. */
export async function analyzeNextJsRepo(
  rootDir: string,
  options?: WorkspaceOptions,
): Promise<StaticAnalysis> {
  const workspace = new RepoWorkspace(rootDir, options);
  return new NextJsAnalyzer(workspace).analyze();
}

export async function analyzeReactRepo(
  rootDir: string,
  options?: WorkspaceOptions,
): Promise<StaticAnalysis> {
  const workspace = new RepoWorkspace(rootDir, options);
  return new ReactAnalyzer(workspace).analyze();
}
