import { CopyButton } from "./code-snippet";
import { cn } from "./ui";
import { BracketsCurlyIcon, CheckCircleIcon } from "./icons";

/**
 * The whole product, as two commands you can copy.
 *
 * It is a timeline rather than a list because the order is the explanation:
 * the first command writes a file, the file is the thing you edit, and the
 * second command publishes it. The artifact between the two steps is what
 * makes that readable — without it the reader has two commands and no idea
 * what happened in between, so it lives inside the first step's column where
 * the rail already runs past it.
 *
 * The rail is drawn by the steps themselves: each one paints a vertical line
 * from its own marker down through the rest of its box, so the last step
 * simply stops and there is no separate rail element to keep in step with the
 * row heights.
 */

/** Marker width plus the column gap, for anything that hangs off the rail. */
const RAIL_INDENT = "pl-[2.375rem]";

interface Step {
  command: string;
  title: string;
  detail: string;
}

const STEPS: [Step, Step] = [
  {
    command: "npx sodiumtools init",
    title: "Install and declare",
    detail:
      "Detects your framework, adds the SDK, and writes sodium.json.",
  },
  {
    command: "npx sodiumtools deploy",
    title: "Publish",
    detail:
      "Validates and publishes a signed version. Your tools go live.",
  },
];

export function CommandTimeline({ className }: { className?: string }) {
  return (
    <ol className={cn("min-w-0", className)}>
      {STEPS.map((step, index) => {
        const last = index === STEPS.length - 1;
        return (
          <li key={step.command} className="flex gap-3.5">
            {/* The marker column: a numbered node, and the rail below it. */}
            <div className="flex flex-col items-center">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] font-mono text-[11px] text-neutral-300 tabular-nums">
                {index + 1}
              </span>
              {!last && (
                <span
                  aria-hidden
                  className="mt-1.5 w-px flex-1 bg-gradient-to-b from-white/15 to-white/[0.07]"
                />
              )}
            </div>

            <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-6")}>
              <p className="text-sm font-medium text-neutral-100">
                {step.title}
              </p>
              {/* The command is the largest thing on this page after the
                  headline, because copying it is the whole ask. The button is
                  always visible and carries its own word: an affordance you
                  have to discover is not one. */}
              {/* Column on a phone, row from `sm` up. Side by side there is
                  not enough width for the command and the button both, and a
                  command that wraps mid-word to make room for a button reads
                  as neither. Stacked, the command gets the full measure and
                  the button gets a full-width target. */}
              <div className="mt-2.5 flex flex-col gap-3 rounded-lg border border-white/12 bg-black/30 p-3 sm:flex-row sm:items-center">
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span
                    aria-hidden
                    className="shrink-0 pl-1 font-mono text-base text-blue-400 select-none"
                  >
                    $
                  </span>
                  <code className="min-w-0 font-mono text-base leading-7 text-neutral-100 [overflow-wrap:anywhere] sm:text-lg">
                    {step.command}
                  </code>
                </span>
                <CopyButton
                  value={step.command}
                  label={`Copy ${step.command}`}
                  event="CLI Command Copied"
                  withLabel
                  className="w-full sm:w-auto"
                />
              </div>
              <p className="mt-2.5 text-sm leading-6 text-neutral-400 text-pretty">
                {step.detail}
              </p>

              {/* The file the first command leaves behind, and the second
                  publishes. Inside step one's column so the rail runs past it. */}
              {index === 0 && (
                <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-faint text-pretty">
                  <BracketsCurlyIcon
                    aria-hidden
                    className="mt-0.5 size-3.5 shrink-0 text-blue-400"
                  />
                  <span>
                    <code className="font-mono text-neutral-300">
                      sodium.json
                    </code>
                    : your tools, in your repo
                  </span>
                </p>
              )}
            </div>
          </li>
        );
      })}

      {/* The payoff, in the reader's own terms. Two commands in and the
          product is doing its job, and the things they will want next are
          already there. */}
      <li className={cn("mt-5 flex items-start gap-2.5", RAIL_INDENT)}>
        <CheckCircleIcon
          aria-hidden
          weight="fill"
          className="mt-0.5 size-4 shrink-0 text-emerald-400"
        />
        <p className="text-sm leading-6 text-neutral-300 text-pretty">
          <span className="font-medium text-neutral-100">Done!</span> AI agents
          can understand and interact with your site. Agent analytics and AEO
          features built-in.
        </p>
      </li>
    </ol>
  );
}
