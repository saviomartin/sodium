import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { getAccountContext } from "@/lib/queries";

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
