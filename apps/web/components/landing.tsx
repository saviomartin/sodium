import { AgentHeadline } from "./agent-headline";
import { AppHeader } from "./app-header";
import { CommandTimeline } from "./command-timeline";
import { HomeNotice, type HomeParams } from "./home-notice";
import { MarketingSections, SiteFooter } from "./marketing";
import { cn, frameClass } from "./ui";
import { ShieldCheckIcon } from "./icons";

/**
 * The product page, shown to anyone without a session.
 *
 * One sentence, then the two commands that make it true. There is no sign-in
 * panel here on purpose: the header carries the only door into the dashboard,
 * so the page's own body is free to be about the product rather than about
 * signing up.
 */
export function Landing({ params }: { params: HomeParams }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader next={params.next ?? "/"} />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 pt-10 pb-16 sm:px-6 sm:pt-16 sm:pb-24">
          <HomeNotice params={params} />

          <header
            className={cn(
              "mx-auto max-w-3xl text-center",
              params.error || params.deleted ? "mt-10" : "",
            )}
          >
            <AgentHeadline size="hero" />
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-neutral-300 text-pretty sm:text-lg">
              Declare what your product can do in one file. Sodium turns it into
              WebMCP tools agents can discover and call, and shows you what they
              did with them.
            </p>
          </header>

          {/* The timeline is the hero's centrepiece. Wide enough that the
              commands read at their full size, still narrower than the column
              so two commands read as two commands rather than as a table. */}
          <div
            className={cn(
              frameClass,
              "mx-auto mt-10 max-w-3xl p-5 sm:mt-12 sm:p-7",
            )}
          >
            <CommandTimeline />
          </div>

          <p className="mx-auto mt-6 flex max-w-3xl items-start gap-2 text-xs leading-5 text-faint text-pretty">
            <ShieldCheckIcon
              aria-hidden
              weight="fill"
              className="mt-0.5 size-3.5 shrink-0 text-neutral-400"
            />
            Google and GitHub are used only for identity. Sodium never requests
            repository access and never reads your code.
          </p>
        </section>

        <MarketingSections />
      </main>

      <SiteFooter />
    </div>
  );
}
