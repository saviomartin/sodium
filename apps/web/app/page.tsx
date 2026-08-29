import { Suspense } from "react";
import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import {
  HomeRepositories,
  RepositoryPanelSkeleton,
} from "@/components/home-repositories";
import { MarketingSections, SiteFooter } from "@/components/marketing";
import { AGENT_SENTENCE, RollingAgent } from "@/components/rolling-agent";
import { SignInPanel } from "@/components/sign-in-panel";
import { StructuredData } from "@/components/structured-data";
import { frameClass } from "@/components/ui";
import { getAccountContext } from "@/lib/queries";
import { OPEN_GRAPH } from "@/lib/seo";

/**
 * The title and description come from the root layout, which already carries
 * the product's own. What only this page can say is that it is the canonical
 * URL for that copy, and og:url has to agree with the canonical or a crawler
 * has two answers for where the page lives.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...OPEN_GRAPH, url: "/" },
};

/**
 * The home page is one page in two states.
 *
 * Hero, features, pricing, FAQ and footer render the same whether or not
 * anyone is signed in. Only the panel below the hero changes: a GitHub sign-in
 * when signed out, the repository list when signed in. Keep new content outside
 * that panel unless it genuinely depends on the session.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    add?: string;
    deleted?: string;
    error?: string;
    next?: string;
  }>;
}) {
  const [account, params] = await Promise.all([
    getAccountContext(),
    searchParams,
  ]);
  const signedIn = Boolean(account.userId);
  const next = params.next ?? "/";

  return (
    <div className="flex min-h-dvh flex-col">
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
        next={next}
      />

      <main className="flex-1">
        <StructuredData />

        <section className="mx-auto w-full max-w-5xl px-4 pt-12 pb-16 sm:px-6 sm:pt-20 sm:pb-24">
          <header className="mx-auto max-w-3xl text-center">
            {/* The rolling agent is decorative repetition of one idea, so the
                sentence assistive tech and crawlers read names every agent
                once, statically, and the animated copy is hidden from them.

                The name takes a line of its own — see `rolling-agent` for why
                that is what keeps the swap still — so the wrap here no longer
                depends on which name is showing, and nothing below the
                headline moves as it rolls. */}
            <h1 className="text-4xl leading-[1.25] font-normal text-neutral-100 text-balance sm:text-5xl">
              <span className="sr-only">{AGENT_SENTENCE}</span>
              <span aria-hidden>
                Make your website usable by
                <RollingAgent />
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-neutral-300 text-pretty sm:text-lg">
              Sodium turns your website’s existing capabilities into WebMCP
              tools that AI agents can discover and use directly.
            </p>
          </header>

          {/* The page's one moving part. Everything else is identical signed
              in or out, so calls to action elsewhere point back at this id. */}
          <div
            id="start"
            className={`mt-10 min-h-72 scroll-mt-16 overflow-hidden sm:mt-12 ${frameClass}`}
          >
            {signedIn ? (
              <Suspense fallback={<RepositoryPanelSkeleton />}>
                <HomeRepositories
                  params={params}
                  avatarUrl={account.avatarUrl}
                />
              </Suspense>
            ) : (
              <SignInPanel params={params} />
            )}
          </div>
        </section>

        <MarketingSections next={next} signedIn={signedIn} />
      </main>

      <SiteFooter />
    </div>
  );
}
