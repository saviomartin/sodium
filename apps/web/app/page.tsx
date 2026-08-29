import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import {
  HomeRepositories,
  RepositoryPanelSkeleton,
} from "@/components/home-repositories";
import { GithubSignInForm } from "@/components/github-sign-in-form";
import { signInWithGithubAction } from "@/lib/actions";
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
  const signedIn = Boolean(account.userId);

  return (
    <div className="min-h-dvh">
      <AppHeader
        account={
          signedIn
            ? {
                email: account.email,
                displayName: account.displayName,
                avatarUrl: account.avatarUrl,
              }
            : null
        }
      />
      <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
        <header className="max-w-3xl">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
            Website tools, made visible
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
            Turn your website into tools ChatGPT can use.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-600 text-pretty sm:text-lg">
            Connect a GitHub repository. Sodium finds useful actions, lets you
            approve them, and gives you one script to add to your site.
          </p>
        </header>

        <section className="mt-10 min-h-64 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm shadow-neutral-900/5 sm:mt-12">
          {signedIn ? (
            <Suspense fallback={<RepositoryPanelSkeleton />}>
              <HomeRepositories params={params} />
            </Suspense>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
              <div className="flex size-11 items-center justify-center rounded-full bg-neutral-950 text-white">
                <svg
                  aria-hidden
                  viewBox="0 0 16 16"
                  className="size-5"
                  fill="currentColor"
                >
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                </svg>
              </div>
              <h2 className="mt-4 text-lg font-semibold">Start with GitHub</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-neutral-500 text-pretty">
                One sign-in identifies you and immediately starts repository
                access. You choose exactly which repositories Sodium can read.
              </p>
              <GithubSignInForm
                action={signInWithGithubAction}
                next={params.next ?? "/"}
              />
              {(params.error || params.deleted) && (
                <p
                  role={params.error ? "alert" : "status"}
                  className={`mt-4 text-sm ${params.error ? "text-red-700" : "text-green-700"}`}
                >
                  {params.error
                    ? params.error
                    : "Your Sodium account and its data were deleted."}
                </p>
              )}
            </div>
          )}
        </section>

        <p className="mt-4 text-center text-xs text-neutral-400">
          Source is analyzed as data. Sodium never executes repository code.
        </p>
      </main>
    </div>
  );
}
