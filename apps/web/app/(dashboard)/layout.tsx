import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { SiteFooter } from "@/components/marketing";
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
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        account={{
          email: account.email,
          displayName: account.displayName,
          avatarUrl: account.avatarUrl,
        }}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
