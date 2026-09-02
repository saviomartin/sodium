/**
 * Path pattern matching for route conditions.
 * Literal segments, `*` (exactly one segment), `**` (zero or more trailing
 * segments). No regex compilation from config data.
 */
export function matchesPathPattern(pattern: string, pathname: string): boolean {
  const patternSegments = split(pattern);
  const pathSegments = split(pathname);

  for (let i = 0; i < patternSegments.length; i++) {
    const patternSegment = patternSegments[i]!;
    if (patternSegment === "**") return true; // matches the rest, including nothing
    const pathSegment = pathSegments[i];
    if (pathSegment === undefined) return false;
    if (patternSegment === "*") continue;
    if (patternSegment !== pathSegment) return false;
  }
  return patternSegments.length === pathSegments.length;
}

function split(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

/** Fills a `/orders/{id}` template from validated input; encodes each value. */
export function fillUrlTemplate(
  template: string,
  input: Record<string, unknown>,
): string | null {
  let missing = false;
  const filled = template.replace(
    /\{([a-zA-Z0-9_]+)\}/g,
    (_, param: string) => {
      const value = input[param];
      if (value === undefined || value === null) {
        missing = true;
        return "";
      }
      return encodeURIComponent(String(value));
    },
  );
  if (missing) return null;
  // Defense in depth: the result must remain a same-origin absolute path.
  if (!filled.startsWith("/") || filled.startsWith("//")) return null;
  return filled;
}
