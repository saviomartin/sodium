import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { getAccountContext } from "@/lib/queries";

/**
 * Nothing under the dashboard is reachable without a session, so nothing
 * under it belongs in an index. Titles still come from the pages themselves
 * and run through the root template.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const account = await getAccountContext();
  if (!account.userId) redirect("/");

  return (
    <div className="min-h-dvh">
      <AppHeader
        account={{
          email: account.email,
          displayName: account.displayName,
          avatarUrl: account.avatarUrl,
        }}
      />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
