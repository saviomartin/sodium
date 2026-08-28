import { Project, ts } from "ts-morph";
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
  extractRouteHandlers,
  extractServerActions,
} from "./extractors";
import { extractZodSchemas } from "./zod-schemas";

const PARSE_EXTENSIONS = /\.(tsx|ts|jsx|js|mjs)$/;

/** Finds the App Router directory ("app" or "src/app"), or null. */
export function detectAppDir(files: string[]): string | null {
  const hasNextConfig = files.some((f) =>
    /^next\.config\.(js|mjs|ts)$/.test(f),
  );
  for (const candidate of ["app", "src/app"]) {
    const marker = files.some(
      (f) =>
        f.startsWith(candidate + "/") &&
        routeFileKind(f.split("/").pop()!) !== null,
    );
    if (marker && (hasNextConfig || files.includes("package.json")))
      return candidate;
  }
  return null;
}

export class NextJsAnalyzer {
  readonly framework = "nextjs";

  constructor(private readonly workspace: RepoWorkspace) {}

  detect(files: string[]): string | null {
    return detectAppDir(files);
  }

  async analyze(): Promise<StaticAnalysis> {
    const files = this.workspace.listSourceFiles();
    const appDir = detectAppDir(files);
    if (!appDir) {
      throw new Error(
        "not a Next.js App Router repository (no app/ or src/app/ with route files)",
      );
    }

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
    const zodSchemas: ZodSchemaInfo[] = [];
    const authSignals: AuthSignalInfo[] = [];

    for (const [filePath, text] of fileTexts) {
      const sourceFile = project.getSourceFile(filePath);
      if (!sourceFile) continue;

      const fileSignals = detectAuthSignals(filePath, text);
      authSignals.push(...fileSignals);

      // Route-file handling for files inside the app dir.
      let pageRoute: { urlPattern: string; pathPattern: string } | null = null;
      if (filePath.startsWith(appDir + "/") || filePath.startsWith(appDir)) {
        const withinApp = filePath.slice(appDir.length + 1);
        const parts = withinApp.split("/");
        const fileName = parts.pop()!;
        const kind = routeFileKind(fileName);
        if (kind) {
          const parsed = parseAppPath(parts.join("/"));
          if (!parsed.excluded) {
            const span = {
              filePath,
              startLine: 1,
              endLine: sourceFile.getEndLineNumber(),
            };
            routes.push({
              urlPattern: parsed.urlPattern,
              pathPattern: parsed.pathPattern,
              kind: kind === "route_handler" ? "route_handler" : kind,
              span,
              params: parsed.params,
            });
            if (kind === "page") {
              pageRoute = {
                urlPattern: parsed.urlPattern,
                pathPattern: parsed.pathPattern,
              };
            }
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
        }
      }

      serverActions.push(
        ...extractServerActions(sourceFile, filePath, fileSignals),
      );
      if (/\.(tsx|jsx)$/.test(filePath)) {
        forms.push(...extractForms(sourceFile, filePath, pageRoute));
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

    return {
      framework: "nextjs",
      appDir,
      routes: routes.sort((a, b) => a.urlPattern.localeCompare(b.urlPattern)),
      serverActions,
      routeHandlers,
      forms,
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
