import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import {
  HomeRepositories,
  RepositoryPanelSkeleton,
} from "@/components/home-repositories";
import { Landing } from "@/components/landing";
import { frameClass } from "@/components/ui";
import { getAccountContext } from "@/lib/queries";

export const metadata = { title: "Sodium" };

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    add?: string;
    deleted?: string;
    error?: string;
    installation?: string;
    next?: string;
  }>;
}) {
  const [account, params] = await Promise.all([
    getAccountContext(),
    searchParams,
  ]);

  if (!account.userId) return <Landing params={params} />;

  return (
    <div className="min-h-dvh">
      <AppHeader
        account={{
          email: account.email,
          displayName: account.displayName,
          avatarUrl: account.avatarUrl,
        }}
      />
      <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
        <header className="max-w-3xl">
          <p className="text-xs font-medium uppercase text-neutral-400">
            Website tools, made visible
          </p>
          <h1 className="mt-5 text-4xl font-medium text-neutral-100 text-balance sm:text-5xl">
            Turn your website into tools ChatGPT can use.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-300 text-pretty sm:text-lg">
            Connect a GitHub repository. Sodium finds useful actions, lets you
            approve them, and gives you one script to add to your site.
          </p>
        </header>

        <section
          className={`mt-10 min-h-64 overflow-hidden sm:mt-12 ${frameClass}`}
        >
          <Suspense fallback={<RepositoryPanelSkeleton />}>
            <HomeRepositories params={params} />
          </Suspense>
        </section>

        <p className="mt-5 text-center text-xs text-neutral-400">
          Source is analyzed as data. Sodium never executes repository code.
        </p>
      </main>
    </div>
  );
}
