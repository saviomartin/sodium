import Link from "next/link";
import { redirect } from "next/navigation";
import { getRepositories } from "@/lib/queries";
import { Card, buttonClass, secondaryButtonClass } from "@/components/ui";

export const metadata = { title: "Repositories" };

export default async function DashboardPage() {
  const repositories = await getRepositories();
  if (repositories.length === 0) redirect("/connect");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
            WebMCP workspace
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Repositories
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            Analyze source, review tools, and publish a signed manifest.
          </p>
        </div>
        <Link href="/connect" className={buttonClass}>
          Connect repository
        </Link>
      </header>

      <Card>
        <ul className="divide-y divide-neutral-100">
          {repositories.map((repository) => (
            <li
              key={repository.id}
              className="flex items-center justify-between gap-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/repos/${repository.id}`}
                  className="truncate text-sm font-semibold text-neutral-900 hover:text-blue-700"
                >
                  {repository.full_name}
                </Link>
                <p className="mt-1 text-xs text-neutral-500">
                  GitHub · {repository.is_private ? "Private" : "Public"} ·{" "}
                  {repository.default_branch}
                </p>
              </div>
              <Link
                href={`/repos/${repository.id}`}
                className={secondaryButtonClass}
              >
                Open
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
