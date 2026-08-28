/**
 * Next.js App Router path conventions → URL patterns.
 * Understands: dynamic [param], catch-all [...param], optional [[...param]],
 * route groups (group), parallel @slots, interception (.)/(..)/(...), and
 * private _folders.
 */

export interface ParsedAppPath {
  /** URL pattern in Next syntax, e.g. /products/[id]. */
  urlPattern: string;
  /** Loader pattern: [id] -> *, [...slug] -> **. */
  pathPattern: string;
  params: string[];
  /** True when the path cannot become a URL (private/interception segment). */
  excluded: boolean;
}

const ROUTE_FILE = /^(page|route|layout)\.(tsx|jsx|ts|js)$/;

export function routeFileKind(
  fileName: string,
): "page" | "route_handler" | "layout" | null {
  const match = ROUTE_FILE.exec(fileName);
  if (!match) return null;
  if (match[1] === "page") return "page";
  if (match[1] === "route") return "route_handler";
  return "layout";
}

/** @param dirPath directory path relative to the app dir, "" for the app root. */
export function parseAppPath(dirPath: string): ParsedAppPath {
  const segments = dirPath === "" ? [] : dirPath.split("/");
  const urlParts: string[] = [];
  const patternParts: string[] = [];
  const params: string[] = [];

  for (const segment of segments) {
    if (segment.startsWith("_")) {
      return { urlPattern: "", pathPattern: "", params: [], excluded: true };
    }
    // Interception markers prefix a segment: (.)photo, (..)photo, (...)photo.
    // Those are modal overlays, not canonical URLs — exclude them.
    if (/^\(\.{1,3}\)/.test(segment)) {
      return { urlPattern: "", pathPattern: "", params: [], excluded: true };
    }
    // Plain route groups are transparent to the URL.
    if (segment.startsWith("(") && segment.endsWith(")")) {
      continue;
    }
    if (segment.startsWith("@")) continue; // parallel slot — transparent to the URL
    const optionalCatchAll = /^\[\[\.\.\.(.+)\]\]$/.exec(segment);
    if (optionalCatchAll) {
      params.push(optionalCatchAll[1]!);
      urlParts.push(segment);
      patternParts.push("**");
      continue;
    }
    const catchAll = /^\[\.\.\.(.+)\]$/.exec(segment);
    if (catchAll) {
      params.push(catchAll[1]!);
      urlParts.push(segment);
      patternParts.push("**");
      continue;
    }
    const dynamic = /^\[(.+)\]$/.exec(segment);
    if (dynamic) {
      params.push(dynamic[1]!);
      urlParts.push(segment);
      patternParts.push("*");
      continue;
    }
    urlParts.push(segment);
    patternParts.push(segment);
  }

  return {
    urlPattern: "/" + urlParts.join("/"),
    pathPattern: "/" + patternParts.join("/"),
    params,
    excluded: false,
  };
}
