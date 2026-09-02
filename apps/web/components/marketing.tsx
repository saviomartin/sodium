import type { ReactNode } from "react";
import Image from "next/image";
import { FAQ } from "@/lib/faq";
import { LandingFeatures } from "./landing-features";
import { StructuredData } from "./structured-data";
import { cn, frameClass } from "./ui";
import { LockSimpleIcon, PlusIcon } from "./icons";

/**
 * The parts of the home page that do not depend on who is reading.
 *
 * Both states render these: a visitor and a customer read the same case for
 * the product, and a customer who is about to add a second app is exactly the
 * person who wants the versioning and analytics sections. Only the top of the
 * page differs — the pitch and its two commands for a visitor, the project
 * list for a customer.
 */

const SECTION_CLASS = "mx-auto w-full max-w-5xl px-4 sm:px-6";

/**
 * The two grounds a band can sit on.
 *
 * Dark bands are separated by a hairline inset to the content column. The
 * light band separates itself — the paper runs the full width of the viewport —
 * so it takes no rule of its own, and every text tier inside it swaps to the
 * cream palette rather than inverting the dark one.
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
    </Section>
  );
}

export function MarketingSections() {
  return (
    <>
      {/* Co-located with the content it describes: the JSON-LD graph restates
          this features grid and this FAQ, so it belongs wherever they render
          rather than in a page that might stop showing them. */}
      <StructuredData />
      <Section
        id="features"
        tone="light"
        title="Built like the rest of your toolchain"
        blurb="No dashboard to configure, no repository to upload, no analysis queue to wait on. Your agent surface is a file you review, deploy, and roll back the way you already do everything else."
      >
        <LandingFeatures />
      </Section>
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
        <p className="inline-flex items-center gap-1.5 text-center text-pretty sm:text-right">
          <LockSimpleIcon aria-hidden className="size-3.5 shrink-0" />
          Your tools execute in your app, never on Sodium.
        </p>
      </div>
    </footer>
  );
}
