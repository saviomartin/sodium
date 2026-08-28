import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndOrgs } from "@/lib/queries";
import { signOutAction } from "@/lib/actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, email, orgs } = await getUserAndOrgs();
  if (!userId) redirect("/login");

  return (
    <div className="min-h-dvh">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <nav className="flex items-center gap-4" aria-label="Primary">
            <Link href="/dashboard" className="text-sm font-semibold">
              Sodium
            </Link>
            {orgs.length > 0 && (
              <span className="text-sm text-neutral-500 truncate">
                {orgs.map((org) => org.name).join(" · ")}
              </span>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-neutral-500 sm:inline truncate">
              {email}
            </span>
            <form action={signOutAction}>
              <button
                className="text-xs font-medium text-neutral-600 hover:text-neutral-900"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
