import type {
  AuthSignalInfo,
  FormInfo,
  RouteInfo,
  StaticAnalysis,
  ZodSchemaInfo,
} from "../types";
import type { RepoWorkspace } from "../workspace";
import { detectAuthSignals } from "../shared/auth";
import {
  extractControls,
  extractForms,
  extractLinks,
} from "../shared/jsx-extractors";
import {
  buildRouteBindings,
  dedupeControls,
  dedupeLinks,
  filesWithinProject,
  finalizeForms,
  loadSourceProject,
  type RouteBinding,
} from "../shared/project";
import { extractZodSchemas } from "../shared/zod-schemas";
import { detectReactProject, type ReactProjectDetection } from "./detection";
import { createReactHrefResolver, extractReactRoutes } from "./routes";

export class ReactAnalyzer {
  readonly framework = "react";
  readonly detection;

  constructor(
    private readonly workspace: RepoWorkspace,
    detection = detectReactProject(workspace),
  ) {
    if (!detection) {
      throw new Error(
        "not a browser React application (React, React DOM, and a web entry point are required)",
      );
    }
    this.detection = detection;
  }

  async analyze(): Promise<StaticAnalysis> {
    const detection: ReactProjectDetection = this.detection;
    const allFiles = this.workspace.listSourceFiles();
    const files = filesWithinProject(allFiles, detection.projectRoot);
    const { project, fileTexts, filesScanned } = loadSourceProject(
      this.workspace,
      files,
    );
    const sourceFiles = new Map(
      [...fileTexts.keys()].flatMap((filePath) => {
        const source = project.getSourceFile(filePath);
        return source ? [[filePath, source] as const] : [];
      }),
    );
    const routeExtraction = extractReactRoutes(
      detection.projectRoot,
      fileTexts,
      sourceFiles,
    );
    const routerless = routeExtraction.routes.length === 0;
    const warnings = [...routeExtraction.warnings];
    let routes = routeExtraction.routes;
    const bindingRoots = new Map(routeExtraction.bindingRoots);

    const combinedSource = [...fileTexts.values()].join("\n");
    const unsupportedRouter = unsupportedRouterImport(combinedSource);
    if (unsupportedRouter) {
      throw new Error(
        `${unsupportedRouter} routing is not supported yet; analysis stopped to avoid publishing tools on incorrect routes`,
      );
    }
    if (
      routes.length === 0 &&
      /from\s+["'](?:react-router|react-router-dom)["']/.test(combinedSource) &&
      /\b(?:Routes|createBrowserRouter|createHashRouter|useRoutes)\b/.test(
        combinedSource,
      )
    ) {
      throw new Error(
        "React Router is present, but its route configuration is dynamic or could not be resolved safely",
      );
    }

    if (routes.length === 0) {
      const entryFile = detection.entryFiles.find((file) =>
        sourceFiles.has(file),
      );
      const entrySource = entryFile ? sourceFiles.get(entryFile) : undefined;
      if (!entryFile || !entrySource) {
        throw new Error("React application entry point could not be parsed");
      }
      const rootRoute: RouteInfo = {
        urlPattern: "/",
        pathPattern: "/",
        kind: "page",
        span: {
          filePath: entryFile,
          startLine: 1,
          endLine: entrySource.getEndLineNumber(),
        },
        params: [],
      };
      routes = [rootRoute];
      addBindings(bindingRoots, entryFile, [
        { urlPattern: "/**", pathPattern: "/**" },
      ]);
    } else {
      const global: RouteBinding = {
        urlPattern: "/**",
        pathPattern: "/**",
      };
      for (const entryFile of detection.entryFiles) {
        if (sourceFiles.has(entryFile))
          addBindings(bindingRoots, entryFile, [global]);
      }
    }

    const routeBindingsByFile = buildRouteBindings(
      project,
      fileTexts,
      bindingRoots,
      detection.projectRoot,
      { stopTraversalAt: routeExtraction.routeTargetFiles },
    );
    const hrefResolver = createReactHrefResolver(
      routeExtraction.mode,
      routeExtraction.basename,
    );
    const forms: FormInfo[] = [];
    const links: StaticAnalysis["links"] = [];
    const controls: NonNullable<StaticAnalysis["controls"]> = [];
    const zodSchemas: ZodSchemaInfo[] = [];
    const authSignals: AuthSignalInfo[] = [];

    for (const [filePath, text] of fileTexts) {
      const sourceFile = sourceFiles.get(filePath);
      if (!sourceFile) continue;
      authSignals.push(...detectAuthSignals(filePath, text));
      const routeBindings = routeBindingsByFile.get(filePath) ?? [];
      if (/\.(tsx|jsx)$/.test(filePath)) {
        const extracted = extractForms(
          sourceFile,
          filePath,
          routeBindings[0] ?? null,
          { functionActionKind: "event_handler" },
        );
        for (const form of extracted) {
          if (routeBindings.length === 0) continue;
          form.urlPattern = routeBindings[0]!.urlPattern;
          form.pathPattern = routeBindings[0]!.pathPattern;
          form.routeBindings = routeBindings;
          forms.push(form);
        }
        links.push(
          ...extractLinks(sourceFile, filePath, routeBindings, {
            resolveHref: hrefResolver,
          }),
        );
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

    finalizeForms(forms, controls, warnings);
    if (routerless && forms.length === 1 && !forms[0]!.selector) {
      forms[0]!.selector = "form";
      const warning = `form in ${forms[0]!.span.filePath} needs a stable id, name, or action attribute before it can become a tool`;
      const index = warnings.indexOf(warning);
      if (index >= 0) warnings.splice(index, 1);
    }
    warnings.push(...this.workspace.skipped.map((item) => `skipped ${item}`));

    return {
      framework: "react",
      projectRoot: detection.projectRoot,
      routes,
      serverActions: [],
      routeHandlers: [],
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

function unsupportedRouterImport(source: string): string | null {
  const match = source.match(
    /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'](@tanstack\/react-router|wouter|@reach\/router|universal-router|hookrouter|react-location)(?:\/[^"']*)?["']/,
  );
  return match?.[1] ?? null;
}

function addBindings(
  roots: Map<string, RouteBinding[]>,
  filePath: string,
  bindings: RouteBinding[],
): void {
  roots.set(filePath, [...(roots.get(filePath) ?? []), ...bindings]);
}
