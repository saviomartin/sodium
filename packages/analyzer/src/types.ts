import type { JsonSchemaSubset } from "@sodium/contracts";

/**
 * Framework-neutral primitives extracted by static analysis. These are the
 * facts the AI synthesis stage groups into goal-level actions; they carry
 * enough location data to become source evidence on contracts.
 */

export interface SourceSpan {
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface RouteInfo {
  /** URL pattern in framework syntax, e.g. /products/[id]. */
  urlPattern: string;
  /** Loader-compatible pattern: dynamic segments become "*". */
  pathPattern: string;
  kind: "page" | "layout" | "route_handler";
  span: SourceSpan;
  /** Param names for dynamic segments, in order. */
  params: string[];
}

export interface ZodSchemaInfo {
  /** Exported (or local) identifier name. */
  name: string;
  span: SourceSpan;
  /** Best-effort static conversion; null when the shape is too dynamic. */
  jsonSchema: JsonSchemaSubset | null;
}

export interface ServerActionInfo {
  name: string;
  span: SourceSpan;
  /** Parameter names as written. */
  params: string[];
  /** True when the action's first param is FormData. */
  takesFormData: boolean;
  /** Name of a zod schema parsed inside the action body, if detected. */
  zodSchemaName?: string;
  authSignals: AuthSignalInfo[];
  excerpt: string;
}

export type HttpMethod =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface RouteHandlerInfo {
  method: HttpMethod;
  urlPattern: string;
  pathPattern: string;
  span: SourceSpan;
  zodSchemaName?: string;
  authSignals: AuthSignalInfo[];
  excerpt: string;
}

export interface FormFieldInfo {
  name: string;
  /** HTML input type or control tag (select, textarea). */
  type: string;
  required: boolean;
  label?: string;
  options?: string[];
}

export interface FormInfo {
  span: SourceSpan;
  /** URL pattern of the page route rendering this form, when resolvable. */
  urlPattern?: string;
  pathPattern?: string;
  fields: FormFieldInfo[];
  /** Server action identifier, or a literal action URL. */
  action:
    | { kind: "server_action"; name: string }
    | { kind: "url"; href: string; method: string }
    | { kind: "unknown" };
  excerpt: string;
}

export type AuthSignalKind =
  | "supabase_get_claims"
  | "supabase_get_user"
  | "next_auth"
  | "clerk"
  | "session_cookie"
  | "redirect_guard"
  | "proxy_middleware";

export interface AuthSignalInfo {
  kind: AuthSignalKind;
  span: SourceSpan;
  detail: string;
}

export interface StaticAnalysis {
  framework: "nextjs";
  /** Root of the app directory relative to the repo root ("app" or "src/app"). */
  appDir: string;
  routes: RouteInfo[];
  serverActions: ServerActionInfo[];
  routeHandlers: RouteHandlerInfo[];
  forms: FormInfo[];
  zodSchemas: ZodSchemaInfo[];
  /** File-level auth signals not tied to a specific primitive. */
  authSignals: AuthSignalInfo[];
  warnings: string[];
  stats: {
    filesScanned: number;
    filesSkipped: number;
    bytesRead: number;
  };
}

/** A framework adapter. Next.js is the only implementation in v1. */
export interface FrameworkAnalyzer {
  framework: string;
  /** Returns null when the workspace does not look like this framework. */
  detect(files: string[]): string | null;
  analyze(): Promise<StaticAnalysis>;
}
