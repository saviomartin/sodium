import { posix } from "node:path";
import {
  Node,
  SyntaxKind,
  type Expression,
  type JsxOpeningElement,
  type JsxSelfClosingElement,
  type ObjectLiteralExpression,
  type SourceFile,
} from "ts-morph";
import type { RouteInfo, SourceSpan } from "../types";
import { attributeText } from "../shared/jsx-extractors";
import {
  importedComponentFile,
  resolveSourceImport,
  type RouteBinding,
} from "../shared/project";

type RouterMode = "browser" | "hash";

interface RawRoute {
  id: number;
  fullPath: string;
  page: boolean;
  componentFile: string | null;
  ancestors: number[];
  span: SourceSpan;
}

export interface ReactRouteExtraction {
  routes: RouteInfo[];
  bindingRoots: Map<string, RouteBinding[]>;
  routeTargetFiles: Set<string>;
  mode: RouterMode;
  basename: string;
  warnings: string[];
}

export function extractReactRoutes(
  projectRoot: string,
  fileTexts: Map<string, string>,
  sourceFiles: Map<string, SourceFile>,
): ReactRouteExtraction {
  const warnings: string[] = [];
  const files = new Set(fileTexts.keys());
  const mode = detectRouterMode(fileTexts);
  const basename = detectBasename(fileTexts);
  const raw: RawRoute[] = [];
  let nextId = 0;

  const pushRoute = (
    sourceFile: SourceFile,
    filePath: string,
    ownPath: string | null,
    index: boolean,
    parentPath: string,
    ancestors: number[],
    componentName: string | null,
    lazySpecifier: string | null,
    span: SourceSpan,
  ): RawRoute => {
    const fullPath = index
      ? parentPath || "/"
      : ownPath === null
        ? parentPath || "/"
        : joinRoutePath(parentPath, ownPath);
    const componentFile = lazySpecifier
      ? resolveSourceImport(filePath, lazySpecifier, files, projectRoot)
      : componentName
        ? importedComponentFile(
            sourceFile,
            filePath,
            componentName,
            files,
            projectRoot,
          )
        : null;
    if ((componentName || lazySpecifier) && !componentFile) {
      warnings.push(
        `React route component could not be resolved in ${filePath}:${span.startLine}`,
      );
    }
    const route: RawRoute = {
      id: nextId++,
      fullPath,
      page: index || ownPath !== null,
      componentFile,
      ancestors,
      span,
    };
    raw.push(route);
    return route;
  };

  for (const [filePath, sourceFile] of sourceFiles) {
    const routeElements: (JsxOpeningElement | JsxSelfClosingElement)[] = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ].filter((element) => element.getTagNameNode().getText() === "Route");

    for (const element of routeElements) {
      const parentElements = element
        .getAncestors()
        .filter(Node.isJsxElement)
        .map((ancestor) => ancestor.getOpeningElement())
        .filter((opening) => opening.getStart() !== element.getStart())
        .filter((opening) => opening.getTagNameNode().getText() === "Route")
        .reverse();
      let parentPath = "";
      const ancestors: number[] = [];
      for (const parent of parentElements) {
        const match = raw.find(
          (candidate) =>
            candidate.span.filePath === filePath &&
            candidate.span.startLine === parent.getStartLineNumber(),
        );
        if (match) {
          parentPath = match.fullPath;
          ancestors.push(match.id);
        } else {
          const path = literalRoutePath(parent);
          if (path !== null) parentPath = joinRoutePath(parentPath, path);
        }
      }
      const index = hasJsxAttribute(element, "index");
      const ownPath = literalRoutePath(element);
      if (!index && ownPath === null && hasJsxAttribute(element, "path")) {
        warnings.push(
          `dynamic React Router path skipped in ${filePath}:${element.getStartLineNumber()}`,
        );
      }
      const componentName = componentFromJsxRoute(element);
      pushRoute(
        sourceFile,
        filePath,
        ownPath,
        index,
        parentPath,
        ancestors,
        componentName,
        lazyImportSpecifier(element.getText()),
        {
          filePath,
          startLine: element.getStartLineNumber(),
          endLine: element.getEndLineNumber(),
        },
      );
    }

    for (const call of sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )) {
      const callee = call.getExpression().getText().split(".").pop();
      if (
        !callee ||
        !["createBrowserRouter", "createHashRouter", "useRoutes"].includes(
          callee,
        )
      ) {
        continue;
      }
      const first = call.getArguments()[0];
      if (!first) continue;
      const resolved = resolveRouteExpression(
        sourceFile,
        filePath,
        first as Expression,
        sourceFiles,
        files,
        projectRoot,
      );
      if (!resolved) {
        if (
          Node.isCallExpression(first) &&
          first.getExpression().getText().split(".").pop() ===
            "createRoutesFromElements"
        ) {
          continue;
        }
        warnings.push(
          `dynamic React Router configuration skipped in ${filePath}:${call.getStartLineNumber()}`,
        );
        continue;
      }
      if (Node.isArrayLiteralExpression(resolved.expression)) {
        visitRouteArray(
          resolved.expression,
          resolved.sourceFile,
          resolved.filePath,
          "",
          [],
          pushRoute,
          warnings,
        );
      }
    }
  }

  const pageVariants = raw.flatMap((route) =>
    route.page
      ? expandRoutePath(route.fullPath).map((path) => ({ route, path }))
      : [],
  );
  const routes = dedupeRoutes(
    pageVariants.map(({ route, path }) => {
      const normalized = applyRouterPrefix(path, mode, basename);
      const parsed = parseReactPath(normalized);
      return {
        urlPattern: normalized,
        pathPattern: parsed.pathPattern,
        kind: "page" as const,
        span: route.span,
        params: parsed.params,
      };
    }),
  );

  const bindingRoots = new Map<string, RouteBinding[]>();
  const routeTargetFiles = new Set<string>();
  for (const candidate of raw) {
    if (!candidate.componentFile) continue;
    routeTargetFiles.add(candidate.componentFile);
    const bound = pageVariants
      .filter(
        ({ route }) =>
          route.id === candidate.id || route.ancestors.includes(candidate.id),
      )
      .map(({ path }) => {
        const urlPattern = applyRouterPrefix(path, mode, basename);
        return {
          urlPattern,
          pathPattern: parseReactPath(urlPattern).pathPattern,
        };
      });
    if (bound.length === 0) continue;
    bindingRoots.set(candidate.componentFile, [
      ...(bindingRoots.get(candidate.componentFile) ?? []),
      ...bound,
    ]);
  }

  return {
    routes,
    bindingRoots: new Map(
      [...bindingRoots].map(([file, bindings]) => [
        file,
        dedupeBindings(bindings),
      ]),
    ),
    routeTargetFiles,
    mode,
    basename,
    warnings,
  };
}

type RoutePusher = (
  sourceFile: SourceFile,
  filePath: string,
  ownPath: string | null,
  index: boolean,
  parentPath: string,
  ancestors: number[],
  componentName: string | null,
  lazySpecifier: string | null,
  span: SourceSpan,
) => RawRoute;

function visitRouteArray(
  array: import("ts-morph").ArrayLiteralExpression,
  sourceFile: SourceFile,
  filePath: string,
  parentPath: string,
  ancestors: number[],
  pushRoute: RoutePusher,
  warnings: string[],
): void {
  for (const element of array.getElements()) {
    if (!Node.isObjectLiteralExpression(element)) {
      warnings.push(
        `non-literal React Router route skipped in ${filePath}:${element.getStartLineNumber()}`,
      );
      continue;
    }
    const pathProperty = propertyInitializer(element, "path");
    const ownPath = pathProperty ? literalString(pathProperty) : null;
    if (pathProperty && ownPath === null) {
      warnings.push(
        `dynamic React Router path skipped in ${filePath}:${element.getStartLineNumber()}`,
      );
    }
    const index = literalBoolean(propertyInitializer(element, "index"));
    const componentName = componentFromObjectRoute(element);
    const lazySpecifier = lazyImportSpecifier(
      propertyInitializer(element, "lazy")?.getText() ?? "",
    );
    const current = pushRoute(
      sourceFile,
      filePath,
      ownPath,
      index,
      parentPath,
      ancestors,
      componentName,
      lazySpecifier,
      {
        filePath,
        startLine: element.getStartLineNumber(),
        endLine: element.getEndLineNumber(),
      },
    );
    const children = propertyInitializer(element, "children");
    if (children && Node.isArrayLiteralExpression(children)) {
      visitRouteArray(
        children,
        sourceFile,
        filePath,
        current.fullPath,
        [...ancestors, current.id],
        pushRoute,
        warnings,
      );
    } else if (children) {
      warnings.push(
        `dynamic React Router children skipped in ${filePath}:${children.getStartLineNumber()}`,
      );
    }
  }
}

interface ResolvedRouteExpression {
  expression: Expression;
  sourceFile: SourceFile;
  filePath: string;
}

function resolveRouteExpression(
  sourceFile: SourceFile,
  filePath: string,
  expression: Expression,
  sourceFiles: Map<string, SourceFile>,
  files: Set<string>,
  projectRoot: string,
  depth = 0,
): ResolvedRouteExpression | null {
  if (depth > 4) return null;
  if (Node.isArrayLiteralExpression(expression)) {
    return { expression, sourceFile, filePath };
  }
  if (Node.isCallExpression(expression)) {
    const callee = expression.getExpression().getText().split(".").pop();
    if (callee === "createRoutesFromElements") {
      return null; // JSX routes are collected independently above.
    }
  }
  if (!Node.isIdentifier(expression)) return null;
  const declaration = sourceFile.getVariableDeclaration(expression.getText());
  const initializer = declaration?.getInitializer() as Expression | undefined;
  if (initializer) {
    return resolveRouteExpression(
      sourceFile,
      filePath,
      initializer,
      sourceFiles,
      files,
      projectRoot,
      depth + 1,
    );
  }

  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const defaultImport = importDeclaration.getDefaultImport();
    const namedImport = importDeclaration.getNamedImports().find((named) => {
      const local = named.getAliasNode()?.getText() ?? named.getName();
      return local === expression.getText();
    });
    if (defaultImport?.getText() !== expression.getText() && !namedImport) {
      continue;
    }
    const importedPath = resolveSourceImport(
      filePath,
      importDeclaration.getModuleSpecifierValue(),
      files,
      projectRoot,
    );
    const importedSource = importedPath ? sourceFiles.get(importedPath) : null;
    if (!importedPath || !importedSource) return null;
    let importedExpression: Expression | undefined;
    if (defaultImport?.getText() === expression.getText()) {
      importedExpression = importedSource
        .getExportAssignments()
        .find((assignment) => !assignment.isExportEquals())
        ?.getExpression();
    } else if (namedImport) {
      importedExpression = importedSource
        .getVariableDeclaration(namedImport.getName())
        ?.getInitializer() as Expression | undefined;
    }
    return importedExpression
      ? resolveRouteExpression(
          importedSource,
          importedPath,
          importedExpression,
          sourceFiles,
          files,
          projectRoot,
          depth + 1,
        )
      : null;
  }
  return null;
}

function propertyInitializer(
  object: ObjectLiteralExpression,
  name: string,
): Expression | null {
  const property = object.getProperty(name);
  if (!property || !Node.isPropertyAssignment(property)) return null;
  return (property.getInitializer() as Expression | undefined) ?? null;
}

function componentFromObjectRoute(
  object: ObjectLiteralExpression,
): string | null {
  const component = propertyInitializer(object, "Component");
  if (component && Node.isIdentifier(component)) return component.getText();
  const element = propertyInitializer(object, "element");
  if (!element) return null;
  const jsx = element.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)[0];
  if (jsx) return rootIdentifier(jsx.getTagNameNode().getText());
  if (Node.isJsxSelfClosingElement(element)) {
    return rootIdentifier(element.getTagNameNode().getText());
  }
  return null;
}

function componentFromJsxRoute(
  element: JsxOpeningElement | JsxSelfClosingElement,
): string | null {
  const component = attributeText(element, "Component");
  if (component && /^[A-Za-z_$][\w$]*$/.test(component)) return component;
  const rendered = attributeText(element, "element");
  const match = rendered?.match(/<([A-Za-z_$][\w$]*)\b/);
  return match?.[1] ?? null;
}

function literalRoutePath(
  element: JsxOpeningElement | JsxSelfClosingElement,
): string | null {
  const path = attributeText(element, "path");
  return path !== undefined && isLiteralPath(path) ? path : null;
}

function hasJsxAttribute(
  element: JsxOpeningElement | JsxSelfClosingElement,
  name: string,
): boolean {
  return element
    .getAttributes()
    .some(
      (attribute) =>
        Node.isJsxAttribute(attribute) &&
        attribute.getNameNode().getText() === name,
    );
}

function literalString(expression: Expression): string | null {
  if (
    Node.isStringLiteral(expression) ||
    Node.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.getLiteralValue();
  }
  return null;
}

function literalBoolean(expression: Expression | null): boolean {
  return expression?.getText() === "true";
}

function lazyImportSpecifier(source: string): string | null {
  return source.match(/\bimport\(\s*["']([^"']+)["']\s*\)/)?.[1] ?? null;
}

function rootIdentifier(name: string): string {
  return name.split(".")[0] ?? name;
}

function isLiteralPath(path: string): boolean {
  return (
    path.length <= 1_024 &&
    !/[{}\s]/.test(path) &&
    !/^(?:https?:)?\/\//.test(path)
  );
}

function joinRoutePath(parent: string, child: string): string {
  if (child.startsWith("/")) return normalizeRoutePath(child);
  return normalizeRoutePath(`${parent || "/"}/${child}`);
}

function normalizeRoutePath(path: string): string {
  const normalized = posix.normalize("/" + path.replace(/^\/+/, ""));
  return normalized !== "/" ? normalized.replace(/\/$/, "") : "/";
}

function expandRoutePath(path: string): string[] {
  let variants = [""];
  for (const segment of normalizeRoutePath(path).split("/").filter(Boolean)) {
    const optional = segment.endsWith("?");
    const clean = optional ? segment.slice(0, -1) : segment;
    variants = variants.flatMap((prefix) => [
      ...(optional ? [prefix] : []),
      `${prefix}/${clean}`,
    ]);
    if (variants.length > 8) return [normalizeRoutePath(path)];
  }
  return [...new Set(variants.map((variant) => variant || "/"))];
}

function parseReactPath(urlPattern: string): {
  pathPattern: string;
  params: string[];
} {
  const params: string[] = [];
  const segments = urlPattern
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (segment === "*") return "**";
      const dynamic = /^:([A-Za-z_$][\w$]*)$/.exec(segment);
      if (dynamic) {
        params.push(dynamic[1]!);
        return "*";
      }
      return segment;
    });
  return { pathPattern: "/" + segments.join("/"), params };
}

function applyRouterPrefix(
  path: string,
  mode: RouterMode,
  basename: string,
): string {
  const withBase =
    basename === "/"
      ? normalizeRoutePath(path)
      : normalizeRoutePath(`${basename}/${path.replace(/^\/+/, "")}`);
  return mode === "hash"
    ? withBase === "/"
      ? "/#/"
      : `/#${withBase}`
    : withBase;
}

function detectRouterMode(fileTexts: Map<string, string>): RouterMode {
  const combined = [...fileTexts.values()].join("\n");
  const hash = /\b(?:HashRouter|createHashRouter)\b/.test(combined);
  const browser = /\b(?:BrowserRouter|createBrowserRouter)\b/.test(combined);
  if (hash && browser) {
    throw new Error(
      "both browser and hash React routers were detected; route ownership is ambiguous",
    );
  }
  return hash ? "hash" : "browser";
}

function detectBasename(fileTexts: Map<string, string>): string {
  const values = new Set<string>();
  for (const text of fileTexts.values()) {
    for (const pattern of [
      /\bbasename\s*=\s*["']([^"']+)["']/g,
      /\bbasename\s*:\s*["']([^"']+)["']/g,
    ]) {
      for (const match of text.matchAll(pattern)) {
        if (match[1]?.startsWith("/")) values.add(normalizeRoutePath(match[1]));
      }
    }
  }
  if (values.size > 1) {
    throw new Error(
      `multiple React Router basenames were detected (${[...values].join(", ")}); route ownership is ambiguous`,
    );
  }
  return [...values][0] ?? "/";
}

function dedupeRoutes(routes: RouteInfo[]): RouteInfo[] {
  const deduped = new Map<string, RouteInfo>();
  for (const route of routes) {
    deduped.set(route.urlPattern, route);
  }
  return [...deduped.values()].sort((a, b) =>
    a.urlPattern.localeCompare(b.urlPattern),
  );
}

function dedupeBindings(bindings: RouteBinding[]): RouteBinding[] {
  return [
    ...new Map(
      bindings.map((binding) => [
        `${binding.urlPattern}\u0000${binding.pathPattern}`,
        binding,
      ]),
    ).values(),
  ];
}

export function createReactHrefResolver(
  mode: RouterMode,
  basename: string,
): (href: string, routes: RouteBinding[]) => string | null {
  return (href, routes) => {
    if (!href || /^(?:https?:)?\/\//.test(href) || href.startsWith("#")) {
      return null;
    }
    if (href.startsWith("/")) {
      return applyRouterPrefix(href, mode, basename);
    }
    if (href.startsWith("?")) return null;
    const resolved = new Set<string>();
    for (const route of routes) {
      const raw = stripRouterPrefix(route.urlPattern, mode, basename);
      if (/[:*]/.test(raw)) return null;
      resolved.add(
        applyRouterPrefix(normalizeRoutePath(`${raw}/${href}`), mode, basename),
      );
    }
    return resolved.size === 1 ? [...resolved][0]! : null;
  };
}

function stripRouterPrefix(
  path: string,
  mode: RouterMode,
  basename: string,
): string {
  let value = mode === "hash" ? path.replace(/^\/#/, "") : path;
  if (basename !== "/" && value.startsWith(basename)) {
    value = value.slice(basename.length) || "/";
  }
  return normalizeRoutePath(value);
}
