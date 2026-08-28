export * from "./types";
export {
  RepoWorkspace,
  sha256Hex,
  stableActionId,
  excerptOf,
} from "./workspace";
export { NextJsAnalyzer, detectAppDir } from "./next/adapter";
export { parseAppPath, routeFileKind } from "./next/routes";
export { detectAuthSignals } from "./next/auth";

import { RepoWorkspace, type WorkspaceOptions } from "./workspace";
import { NextJsAnalyzer } from "./next/adapter";
import type { StaticAnalysis } from "./types";

/** Convenience entry point: analyze an extracted Next.js repo snapshot. */
export async function analyzeNextJsRepo(
  rootDir: string,
  options?: WorkspaceOptions,
): Promise<StaticAnalysis> {
  const workspace = new RepoWorkspace(rootDir, options);
  return new NextJsAnalyzer(workspace).analyze();
}
