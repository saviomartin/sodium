import type { Metadata } from "next";
import { AgentHeadline } from "@/components/agent-headline";
import { AppHeader } from "@/components/app-header";
import { CommandTimeline } from "@/components/command-timeline";
import { HomeNotice } from "@/components/home-notice";
import { Landing } from "@/components/landing";
import { MarketingSections, SiteFooter } from "@/components/marketing";
import { ProjectList } from "@/components/project-list";
import { cn, frameClass } from "@/components/ui";
import {
  BroadcastIcon,
  CubeIcon,
  TerminalWindowIcon,
} from "@/components/icons";
import { getAccountContext, listProjects } from "@/lib/queries";
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
 * The home page is one route in two states, and only its top changes.
 *
 * A visitor gets the pitch and the two commands. A customer gets their
 * projects and the same two commands for the next app. Below that fold both
 * read the identical features and FAQ, because the person adding a second app
 * wants the same answers as the person adding a first.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; error?: string; next?: string }>;
}) {
  const [account, params] = await Promise.all([
    getAccountContext(),
    searchParams,
  ]);
  if (!account.userId) return <Landing params={params} />;

  const projects = await listProjects();
  const live = projects.filter((project) => project.deployment);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        account={{
          email: account.email,
          displayName: account.displayName,
          avatarUrl: account.avatarUrl,
        }}
      />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
          <HomeNotice params={params} />

          <header
            className={cn(
              "flex flex-wrap items-end justify-between gap-x-4 gap-y-2",
              params.error || params.deleted ? "mt-8" : "",
            )}
          >
            <div>
              {/* The pitch, still on the page after sign-in: it is the fastest
                  reminder of what the list below is for. */}
              <AgentHeadline size="mini" />
              <h1 className="mt-1.5 text-2xl font-medium text-neutral-100">
                Projects
              </h1>
            </div>
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              <BroadcastIcon aria-hidden className="size-4" />
              {projects.length === 0
                ? "Awaiting your first deploy"
                : `${live.length} of ${projects.length} deployed`}
            </p>
          </header>

          {projects.length === 0 ? (
            /*
             * Nothing deployed: one box that says what is missing and then how
             * to fix it, centred, with no panel title. Two boxes and a heading
             * would be chrome around a single idea, and the state is temporary
             * by definition — the first deploy replaces it with the list.
             */
            <div className={cn(frameClass, "mt-6 overflow-hidden")}>
              <div className="px-6 pt-10 pb-8 text-center">
                <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-white/[0.06] text-neutral-300">
                  <CubeIcon aria-hidden className="size-5" />
                </span>
                <p className="mt-4 text-base font-medium text-neutral-100">
                  No projects yet
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-400 text-pretty">
                  Sodium creates a project the first time you deploy. Run these
                  two commands in the app you want agents to be able to use.
                </p>
              </div>
              <div className="border-t border-white/[0.07] px-5 pt-6 pb-7 sm:px-7">
                <CommandTimeline className="mx-auto max-w-2xl" />
              </div>
            </div>
          ) : (
            <>
              <div className={cn(frameClass, "mt-6 overflow-hidden")}>
                <ProjectList projects={projects} />
              </div>

              {/* The same timeline the landing page teaches, in the same
                  frame. Someone who has deployed once still needs the two
                  commands for the next app, and they should not have to
                  remember them. */}
              <section
                className={cn(frameClass, "mt-4 overflow-hidden")}
                aria-labelledby="deploy-another-title"
              >
                <header className="flex items-center gap-2 border-b border-white/[0.07] px-5 py-3">
                  <TerminalWindowIcon
                    aria-hidden
                    className="size-4 text-faint"
                  />
                  <h2
                    id="deploy-another-title"
                    className="text-sm font-medium text-neutral-100"
                  >
                    Deploy another app
                  </h2>
                </header>
                <div className="px-5 py-6 sm:px-7">
                  {/* Capped to the measure the landing page gives it. A short
                      command stretched across the full content column reads as
                      a wide empty box rather than as a command. */}
                  <CommandTimeline className="max-w-2xl" />
                </div>
              </section>
            </>
          )}
        </div>

        <MarketingSections />
      </main>

      <SiteFooter />
    </div>
  );
}
