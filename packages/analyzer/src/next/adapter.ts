import { Project, ts } from "ts-morph";
import { posix } from "node:path";
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
import { detectAuthSignals } from "./auth";
import {
  extractForms,
  extractLinks,
  extractRouteHandlers,
  extractServerActions,
} from "./extractors";
import { extractZodSchemas } from "./zod-schemas";

const PARSE_EXTENSIONS = /\.(tsx|ts|jsx|js|mjs)$/;

/** Finds the App Router directory ("app" or "src/app"), or null. */
export function detectAppDir(files: string[]): string | null {
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
  return (
    [...candidates].sort((a, b) => {
      const depth = a.split("/").length - b.split("/").length;
      return depth || a.localeCompare(b);
    })[0] ?? null
  );
}

export class NextJsAnalyzer {
  readonly framework = "nextjs";

  constructor(private readonly workspace: RepoWorkspace) {}

  detect(files: string[]): string | null {
    return detectAppDir(files);
  }

  async analyze(): Promise<StaticAnalysis> {
    const allFiles = this.workspace.listSourceFiles();
    const appDir = detectAppDir(allFiles);
    if (!appDir) {
      throw new Error(
        "not a Next.js App Router repository (no app/ or src/app/ with route files)",
      );
    }
    const projectRoot = appDir.endsWith("/src/app")
      ? appDir.slice(0, -"/src/app".length)
      : appDir === "src/app"
        ? ""
        : appDir.endsWith("/app")
          ? appDir.slice(0, -"/app".length)
          : appDir === "app"
            ? ""
            : "";
    const files = projectRoot
      ? allFiles.filter(
          (file) => file === projectRoot || file.startsWith(projectRoot + "/"),
        )
      : allFiles;

    const warnings: string[] = [];
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        jsx: ts.JsxEmit.Preserve,
        allowJs: true,
        target: ts.ScriptTarget.ESNext,
      },
    });

    const fileTexts = new Map<string, string>();
    let filesScanned = 0;
    for (const filePath of files) {
      if (!PARSE_EXTENSIONS.test(filePath)) continue;
      const text = this.workspace.readFile(filePath);
      if (text === null) continue;
      fileTexts.set(filePath, text);
      project.createSourceFile(filePath, text, { overwrite: true });
      filesScanned++;
    }

    const routes: RouteInfo[] = [];
    const serverActions: ServerActionInfo[] = [];
    const routeHandlers: RouteHandlerInfo[] = [];
    const forms: FormInfo[] = [];
    const links: StaticAnalysis["links"] = [];
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
    const routeBindingsByFile = buildRouteBindings(
      project,
      fileTexts,
      pageRouteByFile,
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

    // A plain `form` selector is safe only when exactly one form is rendered
    // by that route file. Multiple unlabelled forms remain analysis evidence,
    // but are not executable until the application gives them stable ids.
    const formsByRoute = new Map<string, FormInfo[]>();
    for (const form of forms) {
      for (const route of form.routeBindings ?? []) {
        const list = formsByRoute.get(route.pathPattern) ?? [];
        list.push(form);
        formsByRoute.set(route.pathPattern, list);
      }
    }
    for (const form of forms) {
      if (form.selector) continue;
      const bindings = form.routeBindings ?? [];
      if (
        bindings.length > 0 &&
        bindings.every(
          (route) => (formsByRoute.get(route.pathPattern)?.length ?? 0) === 1,
        )
      ) {
        form.selector = "form";
      } else {
        warnings.push(
          `form in ${form.span.filePath} needs a stable id, name, or action attribute before it can become a tool`,
        );
      }
    }

    return {
      framework: "nextjs",
      appDir,
      routes: routes.sort((a, b) => a.urlPattern.localeCompare(b.urlPattern)),
      serverActions,
      routeHandlers,
      forms,
      links: dedupeLinks(links),
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

function buildRouteBindings(
  project: Project,
  fileTexts: Map<string, string>,
  pageRouteByFile: Map<string, { urlPattern: string; pathPattern: string }>,
  projectRoot: string,
): Map<string, { urlPattern: string; pathPattern: string }[]> {
  const files = new Set(fileTexts.keys());
  const dependencies = new Map<string, string[]>();
  for (const filePath of files) {
    const source = project.getSourceFile(filePath);
    if (!source) continue;
    const specifiers = [
      ...source
        .getImportDeclarations()
        .map((item) => item.getModuleSpecifierValue()),
      ...source
        .getExportDeclarations()
        .map((item) => item.getModuleSpecifierValue())
        .filter((item): item is string => Boolean(item)),
    ];
    dependencies.set(
      filePath,
      specifiers
        .map((specifier) =>
          resolveSourceImport(filePath, specifier, files, projectRoot),
        )
        .filter((item): item is string => Boolean(item)),
    );
  }

  const bindings = new Map<
    string,
    Map<string, { urlPattern: string; pathPattern: string }>
  >();
  for (const [pageFile, route] of pageRouteByFile) {
    const pending = [pageFile];
    const visited = new Set<string>();
    while (pending.length > 0 && visited.size <= 2_000) {
      const current = pending.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const routes = bindings.get(current) ?? new Map();
      routes.set(`${route.urlPattern}\u0000${route.pathPattern}`, route);
      bindings.set(current, routes);
      pending.push(...(dependencies.get(current) ?? []));
    }
  }
  return new Map(
    [...bindings].map(([filePath, routes]) => [filePath, [...routes.values()]]),
  );
}

function resolveSourceImport(
  fromFile: string,
  specifier: string,
  files: Set<string>,
  projectRoot: string,
): string | null {
  let base: string;
  if (specifier.startsWith(".")) {
    base = posix.normalize(posix.join(posix.dirname(fromFile), specifier));
  } else if (specifier.startsWith("@/") || specifier.startsWith("~/")) {
    const relative = specifier.slice(2);
    for (const root of [
      projectRoot ? `${projectRoot}/` : "",
      projectRoot ? `${projectRoot}/src/` : "src/",
    ]) {
      const resolved = resolveSourceCandidate(root + relative, files);
      if (resolved) return resolved;
    }
    return null;
  } else {
    return null;
  }
  return resolveSourceCandidate(base, files);
}

function resolveSourceCandidate(
  base: string,
  files: Set<string>,
): string | null {
  for (const candidate of [
    base,
    ...[".tsx", ".ts", ".jsx", ".js", ".mjs"].map((ext) => base + ext),
    ...[".tsx", ".ts", ".jsx", ".js"].map((ext) => `${base}/index${ext}`),
  ]) {
    if (files.has(candidate)) return candidate;
  }
  return null;
}

function dedupeLinks(links: StaticAnalysis["links"]): StaticAnalysis["links"] {
  const deduped = new Map<string, StaticAnalysis["links"][number]>();
  for (const link of links) {
    const key = `${link.href}\u0000${link.span.filePath}\u0000${link.span.startLine}`;
    deduped.set(key, link);
  }
  return [...deduped.values()];
}
