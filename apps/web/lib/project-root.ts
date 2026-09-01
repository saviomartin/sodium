export type ProjectRootResult =
  { ok: true; value: string | null } | { ok: false; error: string };

/** Normalizes the repository-relative application path stored in Postgres. */
export function normalizeProjectRoot(raw: unknown): ProjectRootResult {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: true, value: null };
  if (value === ".") return { ok: true, value };
  if (value.length > 512) {
    return {
      ok: false,
      error: "Application root must be 512 characters or fewer",
    };
  }
  if (value.startsWith("/")) {
    return {
      ok: false,
      error: "Application root must be relative to the repository",
    };
  }
  if (value.endsWith("/")) {
    return { ok: false, error: "Application root must not end with a slash" };
  }
  if (value.includes("\\") || value.includes("//")) {
    return {
      ok: false,
      error: "Application root must use single forward slashes",
    };
  }
  if (
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    return {
      ok: false,
      error: "Application root contains unsupported characters",
    };
  }
  if (value.split("/").some((segment) => segment === "." || segment === "..")) {
    return {
      ok: false,
      error: "Application root must not contain . or .. segments",
    };
  }
  return { ok: true, value };
}
