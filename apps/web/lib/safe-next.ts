const SAFE_BASE = "https://sodium.invalid";

/** Accept only an application-local path, including its query string. */
export function safeNextPath(value: unknown, fallback = "/"): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    return fallback;
  }
  try {
    const url = new URL(value, SAFE_BASE);
    if (url.origin !== SAFE_BASE || url.hash) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

export function pathWithError(
  path: string,
  key: "error" | "authError",
  message: string,
): string {
  const url = new URL(safeNextPath(path), SAFE_BASE);
  url.searchParams.set(key, message);
  return `${url.pathname}${url.search}`;
}
