import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountContext } from "@/lib/queries";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, email } = await getAccountContext();
  if (!userId) redirect("/login");

  return (
    <div className="min-h-dvh">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <nav className="flex items-center gap-5" aria-label="Primary">
            <Link
              href="/dashboard"
              className="text-sm font-bold tracking-tight"
            >
              Sodium
            </Link>
            <Link
              href="/dashboard"
              className="text-xs font-medium text-neutral-600 hover:text-neutral-950"
            >
              Repositories
            </Link>
            <Link
              href="/connect"
              className="text-xs font-medium text-neutral-600 hover:text-neutral-950"
            >
              Connect
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-neutral-500 sm:inline truncate">
              {email}
            </span>
            <Link
              href="/settings"
              className="text-xs font-medium text-neutral-600 hover:text-neutral-950"
            >
              Settings
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
