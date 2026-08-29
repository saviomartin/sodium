import type { ReactNode } from "react";
import Image from "next/image";
import { FAQ } from "@/lib/faq";
import {
  DISCORD_URL,
  ENTERPRISE_PLAN_FEATURES,
  ENTERPRISE_URL,
  REPOSITORY_PLAN_FEATURES,
  REPOSITORY_PRICE_USD,
} from "@/lib/plan";
import { LandingFeatures } from "@/components/landing-features";
import { PlanCard } from "@/components/plan-card";
import {
  buttonClass,
  cn,
  CtaArrow,
  frameClass,
  secondaryButtonClass,
} from "@/components/ui";
import {
  ArrowSquareOutIcon,
  CreditCardIcon,
  PlusIcon,
} from "@/components/icons";

/**
 * The parts of the home page that never change.
 *
 * The page has exactly one moving part: the panel above these sections, which
 * shows a GitHub sign-in when signed out and the repository list when signed
 * in. Everything here renders identically in both states, so a visitor and a
 * customer read the same product page. Calls to action therefore point at
 * `#start` — the panel — rather than branching on the session.
 */

const SECTION_CLASS = "mx-auto w-full max-w-5xl px-4 sm:px-6";

/**
 * The two grounds a band can sit on.
 *
 * Dark bands are separated by a hairline inset to the content column, the way
 * they always have been. The light band separates itself — the paper runs the
 * full width of the viewport — so it takes no rule of its own, and every text
 * tier inside it swaps to the cream palette rather than inverting the dark one.
 */
const TONES = {
  dark: {
    band: "",
    column: "border-t border-white/[0.07]",
    title: "text-neutral-100",
    blurb: "text-neutral-400",
  },
  light: {
    band: "bg-cream",
    column: "",
    title: "text-cream-ink",
    blurb: "text-cream-muted",
  },
} as const;

function Section({
  id,
  title,
  blurb,
  tone = "dark",
  children,
}: {
  id: string;
  title: string;
  blurb?: string;
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  const ink = TONES[tone];
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("scroll-mt-16", ink.band)}
    >
      <div className={cn(SECTION_CLASS, "py-16 sm:py-20", ink.column)}>
        <header className="mx-auto max-w-2xl text-center">
          <h2
            id={`${id}-title`}
            className={cn(
              "text-2xl font-medium text-balance sm:text-3xl",
              ink.title,
            )}
          >
            {title}
          </h2>
          {blurb && (
            <p
              className={cn(
                "mt-3 text-sm leading-7 text-pretty sm:text-base",
                ink.blurb,
              )}
            >
              {blurb}
            </p>
          )}
        </header>
        {children}
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <Section id="pricing" title="Pricing">
      <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:mt-10 sm:grid-cols-2">
        <PlanCard
          name="Repository"
          price={`$${REPOSITORY_PRICE_USD}`}
          cadence="/ month"
          features={REPOSITORY_PLAN_FEATURES}
          action={
            <a href="#start" className={buttonClass}>
              Get started
              <CtaArrow />
            </a>
          }
        />
        <PlanCard
          name="Enterprise"
          features={ENTERPRISE_PLAN_FEATURES}
          action={
            <a
              href={ENTERPRISE_URL}
              target="_blank"
              rel="noreferrer"
              className={secondaryButtonClass}
            >
              Book a demo
              <ArrowSquareOutIcon aria-hidden className="size-4 shrink-0" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          }
        />
      </div>
      <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-neutral-400">
        <CreditCardIcon aria-hidden className="size-4 shrink-0 text-faint" />
        Secure checkout by Stripe. Cancel anytime, from the same screen you
        subscribed on.
      </p>
    </Section>
  );
}

function Faq() {
  return (
    <Section id="faq" title="FAQ">
      <div
        className={cn(frameClass, "mt-8 divide-y divide-white/[0.07] sm:mt-10")}
      >
        {FAQ.map(({ question, answer }) => (
          <details key={question} className="group">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-5 py-4 text-sm font-medium text-neutral-200 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden">
              <span className="text-balance">{question}</span>
              <PlusIcon
                aria-hidden
                weight="bold"
                className="mt-0.5 size-4 shrink-0 text-faint transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none"
              />
            </summary>
            <p className="px-5 pb-5 text-sm leading-6 text-neutral-400 text-pretty sm:max-w-3xl">
              {answer}
            </p>
          </details>
        ))}
      </div>
      <p className="mt-5 text-center text-xs text-neutral-400">
        More questions?{" "}
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-neutral-200 underline underline-offset-4 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          Join our Discord
          <ArrowSquareOutIcon aria-hidden className="size-3.5 shrink-0" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </p>
    </Section>
  );
}

export function MarketingSections({
  next,
  signedIn,
}: {
  /** Where the features section's sign-in returns to, when signed out. */
  next: string;
  signedIn: boolean;
}) {
  return (
    <>
      <Section
        id="features"
        tone="light"
        title="A billion new customers with one line of code"
      >
        <LandingFeatures next={next} signedIn={signedIn} />
      </Section>
      <Pricing />
      <Faq />
    </>
  );
}

export function SiteFooter() {
  return (
    <footer>
      <div
        className={cn(
          SECTION_CLASS,
          "flex flex-col items-center justify-between gap-4 border-t border-white/[0.07] py-8 text-xs text-faint sm:flex-row",
        )}
      >
        <p className="inline-flex items-center gap-1.5 font-mono">
          Sodium by
          <Image
            src="/result-logo-white.svg"
            alt="Result"
            width={22}
            height={11}
            unoptimized
            className="h-[9px] w-auto opacity-70"
          />
        </p>
        <p className="text-center text-pretty sm:text-right">
          Repository code is analyzed as data and never executed.
        </p>
      </div>
    </footer>
  );
}
