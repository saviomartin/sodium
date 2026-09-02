import { AGENT_SENTENCE, RollingAgent } from "./rolling-agent";
import { cn } from "./ui";

/**
 * The product's one sentence, with the agent name rolling through it.
 *
 * Two sizes, one implementation, because the accessibility contract is the
 * part that must not be duplicated: the roll is decorative repetition of a
 * single idea, so assistive tech and crawlers read a static sentence that
 * names every agent once and the animated copy is hidden from them. Getting
 * that wrong in one of two copies is how a page ends up reading nine agent
 * names to a screen reader on a loop.
 *
 * `hero` is the landing page's h1: centred, with the label on a line of its
 * own so no name's width can move the sentence. `mini` sits above the signed-in
 * project list as one left-aligned line, which is safe because the label is
 * the last thing on it.
 */
export function AgentHeadline({
  size,
  className,
}: {
  size: "hero" | "mini";
  className?: string;
}) {
  if (size === "hero") {
    return (
      <h1
        className={cn(
          "text-4xl leading-[1.25] font-normal text-neutral-100 text-balance sm:text-5xl",
          className,
        )}
      >
        <span className="sr-only">{AGENT_SENTENCE}</span>
        <span aria-hidden>
          Make your website usable by
          <RollingAgent />
        </span>
      </h1>
    );
  }

  return (
    <p className={cn("text-sm leading-6 text-faint", className)}>
      <span className="sr-only">{AGENT_SENTENCE}</span>
      <span aria-hidden>
        Make your website usable by{" "}
        <RollingAgent inline className="font-medium text-neutral-200" />
      </span>
    </p>
  );
}
