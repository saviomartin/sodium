import { posix } from "node:path";
import { Project, ts, type SourceFile } from "ts-morph";
import type { ControlInfo, FormInfo, LinkInfo } from "../types";
import type { RepoWorkspace } from "../workspace";

export const PARSE_EXTENSIONS = /\.(tsx|ts|jsx|js|mjs|cjs)$/;

export interface RouteBinding {
  urlPattern: string;
  pathPattern: string;
}

export interface LoadedSourceProject {
  project: Project;
  fileTexts: Map<string, string>;
  filesScanned: number;
}

export function filesWithinProject(
  files: string[],
  projectRoot: string,
): string[] {
  return projectRoot
    ? files.filter(
        (file) => file === projectRoot || file.startsWith(projectRoot + "/"),
      )
    : files;
}

export function loadSourceProject(
  workspace: RepoWorkspace,
  files: string[],
): LoadedSourceProject {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      allowJs: true,
      checkJs: false,
      target: ts.ScriptTarget.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
  });
  const fileTexts = new Map<string, string>();
  let filesScanned = 0;
  for (const filePath of files) {
    if (!PARSE_EXTENSIONS.test(filePath)) continue;
    const text = workspace.readFile(filePath);
    if (text === null) continue;
    fileTexts.set(filePath, text);
    project.createSourceFile(filePath, text, { overwrite: true });
    filesScanned++;
  }
  return { project, fileTexts, filesScanned };
}

export function buildRouteBindings(
  project: Project,
  fileTexts: Map<string, string>,
  bindingRoots: Map<string, RouteBinding[]>,
  projectRoot: string,
  options: { stopTraversalAt?: Set<string> } = {},
): Map<string, RouteBinding[]> {
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

  const bindings = new Map<string, Map<string, RouteBinding>>();
  for (const [rootFile, rootRoutes] of bindingRoots) {
    const pending = [rootFile];
    const visited = new Set<string>();
    while (pending.length > 0 && visited.size <= 2_000) {
      const current = pending.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      if (current !== rootFile && options.stopTraversalAt?.has(current)) {
        continue;
      }
      const routes = bindings.get(current) ?? new Map<string, RouteBinding>();
      for (const route of rootRoutes) {
        routes.set(`${route.urlPattern}\u0000${route.pathPattern}`, route);
      }
      bindings.set(current, routes);
      pending.push(...(dependencies.get(current) ?? []));
    }
  }

  return new Map(
    [...bindings].map(([filePath, routes]) => [
      filePath,
      [...routes.values()].sort((a, b) =>
        a.urlPattern.localeCompare(b.urlPattern),
      ),
    ]),
  );
}

export function resolveSourceImport(
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

export function resolveSourceCandidate(
  base: string,
  files: Set<string>,
): string | null {
  for (const candidate of [
    base,
    ...[".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs"].map(
      (extension) => base + extension,
    ),
    ...[".tsx", ".ts", ".jsx", ".js"].map(
      (extension) => `${base}/index${extension}`,
    ),
  ]) {
    if (files.has(candidate)) return candidate;
  }
  return null;
}

export function importedComponentFile(
  sourceFile: SourceFile,
  sourcePath: string,
  localName: string,
  files: Set<string>,
  projectRoot: string,
): string | null {
  for (const declaration of sourceFile.getImportDeclarations()) {
    let matches = declaration.getDefaultImport()?.getText() === localName;
    matches ||= declaration.getNamespaceImport()?.getText() === localName;
    matches ||= declaration.getNamedImports().some((named) => {
      const local = named.getAliasNode()?.getText() ?? named.getName();
      return local === localName;
    });
    if (!matches) continue;
    return resolveSourceImport(
      sourcePath,
      declaration.getModuleSpecifierValue(),
      files,
      projectRoot,
    );
  }
  return sourcePath;
}

export function finalizeForms(
  forms: FormInfo[],
  controls: ControlInfo[],
  warnings: string[],
): void {
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
    const coveredByExecutableControl =
      form.fields.length === 0 &&
      controls.some(
        (control) =>
          control.span.filePath === form.span.filePath &&
          control.span.startLine >= form.span.startLine &&
          control.span.endLine <= form.span.endLine,
      );
    if (coveredByExecutableControl) continue;
    const bindings = form.routeBindings ?? [];
    if (
      bindings.length > 0 &&
      bindings.every(
        (route) =>
          !route.pathPattern.includes("*") &&
          (formsByRoute.get(route.pathPattern)?.length ?? 0) === 1,
      )
    ) {
      form.selector = "form";
    } else {
      warnings.push(
        `form in ${form.span.filePath} needs a stable id, name, or action attribute before it can become a tool`,
      );
    }
  }
}

export function dedupeLinks(links: LinkInfo[]): LinkInfo[] {
  const deduped = new Map<string, LinkInfo>();
  for (const link of links) {
    const routes = link.routeBindings
      .map((route) => route.pathPattern)
      .sort()
      .join("\u0000");
    const key = `${link.href}\u0000${link.span.filePath}\u0000${link.span.startLine}\u0000${routes}`;
    deduped.set(key, link);
  }
  return [...deduped.values()];
}

export function dedupeControls(controls: ControlInfo[]): ControlInfo[] {
  const deduped = new Map<string, ControlInfo>();
  for (const control of controls) {
    const routes = control.routeBindings
      .map((route) => route.pathPattern)
      .sort()
      .join("\u0000");
    deduped.set(
      `${control.selector ?? `button:${control.accessibleName ?? ""}`}\u0000${routes}`,
      control,
    );
  }
  return [...deduped.values()];
}
