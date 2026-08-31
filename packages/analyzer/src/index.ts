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
  projectRootForAppDir,
} from "./next/adapter";
export { ReactAnalyzer } from "./react/adapter";
export {
  AmbiguousReactProjectError,
  detectReactProject,
} from "./react/detection";
export { createReactHrefResolver, extractReactRoutes } from "./react/routes";
export { parseAppPath, routeFileKind } from "./next/routes";
export { detectAuthSignals } from "./shared/auth";

import { RepoWorkspace, type WorkspaceOptions } from "./workspace";
import { NextJsAnalyzer, detectAppDir } from "./next/adapter";
import { ReactAnalyzer } from "./react/adapter";
import { detectReactProject } from "./react/detection";
import type { FrameworkAnalyzer, StaticAnalysis } from "./types";

/** Analyze a supported repository without executing any repository code. */
export async function analyzeRepo(
  rootDir: string,
  options?: WorkspaceOptions,
): Promise<StaticAnalysis> {
  const workspace = new RepoWorkspace(rootDir, options);
  const analyzer = selectFrameworkAnalyzer(workspace);
  if (!analyzer) {
    throw new UnsupportedFrameworkError(
      "unsupported repository: expected a Next.js App Router app or a browser React app with React DOM and a web entry point",
    );
  }
  return analyzer.analyze();
}

export function selectFrameworkAnalyzer(
  workspace: RepoWorkspace,
): FrameworkAnalyzer | null {
  const appDir = detectAppDir(workspace.listSourceFiles());
  if (appDir) return new NextJsAnalyzer(workspace, appDir);
  const react = detectReactProject(workspace);
  return react ? new ReactAnalyzer(workspace, react) : null;
}

export class UnsupportedFrameworkError extends Error {}

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
