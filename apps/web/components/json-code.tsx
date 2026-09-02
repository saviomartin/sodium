import { tokenizeJson, type JsonTokenKind } from "@/lib/highlight-json";
import { cn } from "./ui";

/**
 * Highlight hues stay inside the palette the rest of the app already uses:
 * blue for field names, emerald for string values, amber for numbers and
 * literals, faint for the braces holding them together.
 *
 * These are tuned for a dark inset, which is what a code block is everywhere
 * in this app — including inside the landing page's light band, where the
 * snippet keeps its own ground rather than inverting.
 */
const TOKEN_CLASSES: Record<JsonTokenKind, string> = {
  key: "text-blue-300",
  string: "text-emerald-300",
  number: "text-amber-200",
  keyword: "text-amber-200",
  punctuation: "text-faint",
  text: "text-neutral-300",
};

/**
 * A JSON snippet, coloured and wrapped so no part of it is hidden off-screen.
 *
 * Server-safe on purpose: the tokenizer is pure, so a snippet that never
 * changes — the contract excerpt on the landing page — costs no client
 * JavaScript at all.
 */
export function JsonCode({
  snippet,
  className,
}: {
  snippet: string;
  className?: string;
}) {
  return (
    <pre
      className={cn(
        "p-3 font-mono text-xs leading-5 whitespace-pre-wrap text-neutral-300 [overflow-wrap:anywhere]",
        className,
      )}
    >
      <code>
        {tokenizeJson(snippet).map((token, index) => (
          <span key={index} className={TOKEN_CLASSES[token.kind]}>
            {token.text}
          </span>
        ))}
      </code>
    </pre>
  );
}
