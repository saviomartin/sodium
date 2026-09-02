import { redirect } from "next/navigation";

/**
 * A permanent alias for the project list, which lives at `/`.
 *
 * It forwards the query string. A bare `redirect("/")` drops it, and anything
 * that lands here carrying a message — a `?deleted=` confirmation, an
 * `?error=` — would have that message silently swallowed on the way home.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const one of Array.isArray(value) ? value : [value ?? ""]) {
      if (one) params.append(key, one);
    }
  }
  redirect(params.size > 0 ? `/?${params.toString()}` : "/");
}
