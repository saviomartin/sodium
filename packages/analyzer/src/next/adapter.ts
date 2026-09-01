import type { RepoWorkspace } from "../workspace";
import type {
  AuthSignalInfo,
  FormInfo,
  RouteHandlerInfo,
  RouteInfo,
  ServerActionInfo,
  StaticAnalysis,
  ZodSchemaInfo,
} from "../types";
import { parseAppPath, routeFileKind } from "./routes";
import { detectAuthSignals } from "../shared/auth";
import {
  extractForms,
  extractControls,
  extractLinks,
  extractRouteHandlers,
  extractServerActions,
} from "../shared/jsx-extractors";
import { extractZodSchemas } from "../shared/zod-schemas";
import {
  buildRouteBindings,
  dedupeControls,
  dedupeLinks,
  filesWithinProject,
  finalizeForms,
  loadSourceProject,
} from "../shared/project";

/** Finds the App Router directory ("app" or "src/app"), or null. */
export function detectAppDir(files: string[]): string | null {
  return detectAppDirs(files)[0] ?? null;
}

/** Finds every independently deployable App Router directory. */
export function detectAppDirs(files: string[]): string[] {
  const fileSet = new Set(files);
  const candidates = new Set<string>();
  for (const file of files) {
    if (!routeFileKind(file.split("/").pop()!)) continue;
    const segments = file.split("/");
    const appIndex = segments.lastIndexOf("app");
    if (appIndex < 0) continue;
    const appDir = segments.slice(0, appIndex + 1).join("/");
    const projectSegments = segments.slice(
      0,
      appIndex > 0 && segments[appIndex - 1] === "src"
        ? appIndex - 1
        : appIndex,
    );
    const projectRoot = projectSegments.join("/");
    const packagePath = projectRoot
      ? `${projectRoot}/package.json`
      : "package.json";
    const hasConfig = ["js", "mjs", "ts"].some((extension) =>
      fileSet.has(
        projectRoot
          ? `${projectRoot}/next.config.${extension}`
          : `next.config.${extension}`,
      ),
    );
    if (fileSet.has(packagePath) || hasConfig) candidates.add(appDir);
  }
  return [...candidates].sort((a, b) => {
    const depth = a.split("/").length - b.split("/").length;
    return depth || a.localeCompare(b);
  });
}

export class NextJsAnalyzer {
  readonly framework = "nextjs";
  readonly detection;
  private readonly appDir: string;

  constructor(
    private readonly workspace: RepoWorkspace,
    appDir = detectAppDir(workspace.listSourceFiles()),
  ) {
    if (!appDir) {
      throw new Error(
        "not a Next.js App Router repository (no app/ or src/app/ with route files)",
      );
    }
    this.appDir = appDir;
    this.detection = {
      framework: this.framework,
      projectRoot: projectRootForAppDir(appDir),
      detail: `Next.js App Router (${appDir})`,
    } as const;
  }

  async analyze(): Promise<StaticAnalysis> {
    const allFiles = this.workspace.listSourceFiles();
    const appDir = this.appDir;
    const projectRoot = projectRootForAppDir(appDir);
    const files = filesWithinProject(allFiles, projectRoot);

    const warnings: string[] = [];
    const { project, fileTexts, filesScanned } = loadSourceProject(
      this.workspace,
      files,
    );

    const routes: RouteInfo[] = [];
    const serverActions: ServerActionInfo[] = [];
    const routeHandlers: RouteHandlerInfo[] = [];
    const forms: FormInfo[] = [];
    const links: StaticAnalysis["links"] = [];
    const controls: NonNullable<StaticAnalysis["controls"]> = [];
    const zodSchemas: ZodSchemaInfo[] = [];
    const authSignals: AuthSignalInfo[] = [];

    const pageRouteByFile = new Map<
      string,
      { urlPattern: string; pathPattern: string }
    >();
    for (const filePath of fileTexts.keys()) {
      const route = routeForFile(filePath, appDir);
      if (route?.kind === "page") {
        pageRouteByFile.set(filePath, {
          urlPattern: route.urlPattern,
          pathPattern: route.pathPattern,
        });
      }
    }
    const browserBindingRoots = new Map(
      [...pageRouteByFile].map(([filePath, route]) => [filePath, [route]]),
    );
    for (const filePath of fileTexts.keys()) {
      const route = routeForFile(filePath, appDir);
      if (route?.kind !== "layout") continue;
      browserBindingRoots.set(filePath, [
        {
          urlPattern:
            route.urlPattern === "/" ? "/**" : `${route.urlPattern}/**`,
          pathPattern:
            route.pathPattern === "/" ? "/**" : `${route.pathPattern}/**`,
        },
      ]);
    }
    const routeBindingsByFile = buildRouteBindings(
      project,
      fileTexts,
      browserBindingRoots,
      projectRoot,
    );

    for (const [filePath, text] of fileTexts) {
      const sourceFile = project.getSourceFile(filePath);
      if (!sourceFile) continue;

      const fileSignals = detectAuthSignals(filePath, text);
      authSignals.push(...fileSignals);

      // Route-file handling for files inside the app dir.
      const pageRoute = pageRouteByFile.get(filePath) ?? null;
      const resolvedRoute = routeForFile(filePath, appDir);
      if (resolvedRoute) {
        const { kind, ...parsed } = resolvedRoute;
        const span = {
          filePath,
          startLine: 1,
          endLine: sourceFile.getEndLineNumber(),
        };
        routes.push({
          urlPattern: parsed.urlPattern,
          pathPattern: parsed.pathPattern,
          kind,
          span,
          params: parsed.params,
        });
        if (kind === "route_handler") {
          routeHandlers.push(
            ...extractRouteHandlers(
              sourceFile,
              filePath,
              parsed.urlPattern,
              parsed.pathPattern,
              fileSignals,
            ),
          );
        }
      }

      serverActions.push(
        ...extractServerActions(sourceFile, filePath, fileSignals),
      );
      if (/\.(tsx|jsx)$/.test(filePath)) {
        const routeBindings = routeBindingsByFile.get(filePath) ?? [];
        const extracted = extractForms(
          sourceFile,
          filePath,
          routeBindings[0] ?? pageRoute,
        );
        for (const form of extracted) {
          if (routeBindings.length > 0) {
            form.urlPattern = routeBindings[0]!.urlPattern;
            form.pathPattern = routeBindings[0]!.pathPattern;
            form.routeBindings = routeBindings;
          }
        }
        forms.push(...extracted);
        links.push(...extractLinks(sourceFile, filePath, routeBindings));
        controls.push(...extractControls(sourceFile, filePath, routeBindings));
      }
      try {
        zodSchemas.push(...extractZodSchemas(sourceFile, filePath, warnings));
      } catch (error) {
        warnings.push(
          `zod extraction failed in ${filePath}: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
    }

    warnings.push(...this.workspace.skipped.map((s) => `skipped ${s}`));

    finalizeForms(forms, controls, warnings);

    return {
      framework: "nextjs",
      projectRoot,
      appDir,
      routes: routes.sort((a, b) => a.urlPattern.localeCompare(b.urlPattern)),
      serverActions,
      routeHandlers,
      forms,
      links: dedupeLinks(links),
      controls: dedupeControls(controls),
      zodSchemas,
      authSignals,
      warnings,
      stats: {
        filesScanned,
        filesSkipped: this.workspace.skipped.length,
        bytesRead: this.workspace.bytesRead,
      },
    };
  }
}

export function projectRootForAppDir(appDir: string): string {
  if (appDir === "app" || appDir === "src/app") return "";
  if (appDir.endsWith("/src/app")) return appDir.slice(0, -"/src/app".length);
  if (appDir.endsWith("/app")) return appDir.slice(0, -"/app".length);
  return "";
}

function routeForFile(
  filePath: string,
  appDir: string,
):
  | (ReturnType<typeof parseAppPath> & {
      kind: "page" | "layout" | "route_handler";
    })
  | null {
  if (!(filePath === appDir || filePath.startsWith(appDir + "/"))) return null;
  const withinApp = filePath.slice(appDir.length + 1);
  const parts = withinApp.split("/");
  const kind = routeFileKind(parts.pop()!);
  if (!kind) return null;
  const parsed = parseAppPath(parts.join("/"));
  return parsed.excluded ? null : { ...parsed, kind };
}
