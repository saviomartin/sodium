"use client";

import { useEffect, useState } from "react";
import { preload } from "react-dom";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/**
 * The one moving line in the hero: "…usable by" / "<mark> ChatGPT".
 *
 * Each agent swaps in as a single unit — brand mark and name together — so the
 * pair always reads as one label rather than two things that happen to change
 * at the same time.
 *
 * The label sits on its own centred line, and that is what lets the swap happen
 * without travel. Names differ in width by more than 2x ("Grok" against
 * "Perplexity"), so inline they would have to push the rest of the sentence
 * around as they changed — the whole line re-centring on every roll. Given a
 * line to itself, every name is centred on the same axis, the outgoing and
 * incoming labels overlap around that shared centre, and nothing else on the
 * page moves. The transition is then only what it needs to be: blur out, blur
 * in. No slide, no tilt, no width animation to correct for.
 */

interface Agent {
  name: string;
  /**
   * The brand mark, cropped to the symbol so the product's own wordmark never
   * competes with the headline's type.
   *
   * `width` is that crop's aspect ratio at height 100 — the ratio
   * `next/image` reserves space with. `em` is the rendered height against the
   * headline's font size, so marks track the type through every breakpoint. It
   * is tuned per mark rather than shared, because equal height is not equal
   * weight: a solid geometric mark like xAI's reads heavier than a concave one
   * like Gemini's spark at the same measure, so the two are sized to look
   * alike instead of measure alike.
   */
  logo: { src: string; width: number; em: number };
}

const AGENTS: readonly [Agent, ...Agent[]] = [
  { name: "ChatGPT", logo: { src: "/logos/chatgpt.svg", width: 114, em: 0.82 } },
  { name: "Claude", logo: { src: "/logos/claude.svg", width: 100, em: 0.8 } },
  {
    name: "Perplexity",
    logo: { src: "/logos/perplexity.svg", width: 76, em: 0.82 },
  },
  { name: "Grok", logo: { src: "/logos/grok.svg", width: 91, em: 0.72 } },
  { name: "Gemini", logo: { src: "/logos/gemini.svg", width: 100, em: 0.9 } },
  { name: "Copilot", logo: { src: "/logos/copilot.svg", width: 110, em: 0.8 } },
  {
    name: "DeepSeek",
    logo: { src: "/logos/deepseek.svg", width: 136, em: 0.8 },
  },
  {
    name: "OpenClaw",
    logo: { src: "/logos/openclaw.svg", width: 111, em: 0.82 },
  },
  // Hermes carries Nous Research's mark, the only one published for it. It is
  // an illustrated portrait rather than a geometric symbol, so it takes both
  // the largest `em` in the table and an inversion to white — the source is
  // Nous's monochrome pinned-tab icon, which is drawn as black ink. Even so it
  // is the busiest mark here; below about 0.9em its line work fills in.
  { name: "Hermes", logo: { src: "/logos/hermes.svg", width: 98, em: 0.95 } },
];

/** How long each agent holds before the next one rolls in. */
const HOLD_MS = 2200;

/** Every name in one sentence, for the copy that assistive tech reads. */
export const AGENT_SENTENCE = `Make your website usable by ${AGENTS.map(
  (agent, position) =>
    position === AGENTS.length - 1 ? `and ${agent.name}` : `${agent.name}, `,
).join("")}.`;

export function RollingAgent({
  /**
   * Put the label on the end of the sentence's own line instead of a line of
   * its own.
   *
   * Only safe when nothing follows it. Names differ in width by more than 2x,
   * so an inline label that has text after it would push that text around on
   * every roll; as the last thing on a left-aligned line, the only edge that
   * moves is the label's own.
   */
  inline = false,
  className,
}: {
  inline?: boolean;
  /** Applied to the label itself, so a caller can weight or colour the name. */
  className?: string;
} = {}) {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  // Only one mark is mounted at a time, so without this the first sighting of
  // each logo would be the frame it is meant to animate in on. They are a few
  // kilobytes each and same-origin; fetching the set up front costs nothing
  // and means every roll after the first has its image already decoded.
  for (const { logo } of AGENTS) preload(logo.src, { as: "image" });

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % AGENTS.length),
      HOLD_MS,
    );
    return () => clearInterval(timer);
  }, []);

  const agent = AGENTS[index] ?? AGENTS[0];

  // The roll itself is the message, so reduced motion keeps it and drops the
  // blur, leaving a plain crossfade.
  const hidden = reduceMotion
    ? { opacity: 0 }
    : { opacity: 0, filter: "blur(10px)" };

  return (
    // `relative`: `popLayout` takes the outgoing label out of flow, and it
    // needs this as its containing block to stay put while it fades.
    <span className={inline ? "relative inline-block" : "relative block"}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={agent.name}
          initial={hidden}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={hidden}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className={`inline-block whitespace-nowrap${className ? ` ${className}` : ""}`}
        >
          {/* The mark rides in normal inline flow rather than as a flex item.
              A flex box takes its baseline from its first child, and an image
              has none — so the row's baseline would become the image's bottom
              edge, dragging the label off the surrounding text's baseline.

              `verticalAlign` then sits the mark on the cap-height axis: caps
              rise about 0.72em, so their centre is 0.36em over the baseline,
              and a mark of height `em` meets it when its foot is half its own
              height below that. */}
          <Image
            src={agent.logo.src}
            alt=""
            width={agent.logo.width}
            height={100}
            unoptimized
            style={{
              height: `${agent.logo.em}em`,
              verticalAlign: `${(0.36 - agent.logo.em / 2).toFixed(3)}em`,
            }}
            className="mr-[0.3em] inline-block w-auto"
          />
          {agent.name}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
