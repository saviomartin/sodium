export const SODIUM_ENVIRONMENTS = [
  "development",
  "preview",
  "production",
] as const;

export type SodiumEnvironment = (typeof SODIUM_ENVIRONMENTS)[number];

/**
 * Public project refs are intentionally pinned. A mis-scoped Vercel variable
 * must fail during startup instead of sending development traffic to the
 * production database.
 */
export const SUPABASE_PROJECT_REFS: Record<SodiumEnvironment, string> = {
  development: "laqlbydlawieccohknsj",
  preview: "laqlbydlawieccohknsj",
  production: "wsacbkkbvkcuqgiagxms",
};

export function supabaseProjectRef(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    const match = /^([a-z]{20})\.supabase\.co$/.exec(hostname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function assertSupabaseEnvironment(
  environment: SodiumEnvironment,
  url: string,
): void {
  const actual = supabaseProjectRef(url);
  const expected = SUPABASE_PROJECT_REFS[environment];
  if (actual !== expected) {
    throw new Error(
      `Supabase environment mismatch: ${environment} requires project ${expected}, received ${actual ?? "an invalid Supabase URL"}`,
    );
  }
}
