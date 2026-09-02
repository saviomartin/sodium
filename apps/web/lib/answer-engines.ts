/**
 * The answer engines the loader can attribute, mirroring the detection table in
 * `@sodium/runtime`'s telemetry module. Keep `name` byte-identical to the value
 * the runtime reports — the dashboard joins recorded traffic on it.
 *
 * `color` is the ink for engines whose official mark is monochrome — it is
 * chrome, never a data encoding, so it is exempt from the categorical palette
 * in `viz.ts`. Engines with a colored logo carry their palette inside the mark
 * itself (see `answer-engine-mark.tsx`); `color` is their key hue, kept for
 * fallbacks.
 */
export interface AnswerEngineBrand {
  name: string;
  /** Where the referral comes from, shown under the name. */
  host: string;
  color: string;
}

export const ANSWER_ENGINE_NAMES = [
  "ChatGPT",
  "Claude",
  "Perplexity",
  "Gemini",
  "Copilot",
  "Grok",
  "DeepSeek",
  "Mistral",
  "You.com",
] as const;

export type AnswerEngineName = (typeof ANSWER_ENGINE_NAMES)[number];

export const ANSWER_ENGINES: readonly AnswerEngineBrand[] = [
  { name: "ChatGPT", host: "chatgpt.com", color: "#ededed" },
  { name: "Claude", host: "claude.ai", color: "#d97757" },
  { name: "Perplexity", host: "perplexity.ai", color: "#1fb8cd" },
  { name: "Gemini", host: "gemini.google.com", color: "#8e75b2" },
  { name: "Copilot", host: "copilot.microsoft.com", color: "#0078d4" },
  { name: "Grok", host: "grok.com", color: "#ededed" },
  { name: "DeepSeek", host: "chat.deepseek.com", color: "#5786fe" },
  { name: "Mistral", host: "chat.mistral.ai", color: "#fa520f" },
  { name: "You.com", host: "you.com", color: "#596ced" },
] as const;

export const ANSWER_ENGINE_COUNT = ANSWER_ENGINES.length;

const BY_NAME = new Map(ANSWER_ENGINES.map((engine) => [engine.name, engine]));

export function answerEngineBrand(name: string): AnswerEngineBrand {
  return BY_NAME.get(name) ?? { name, host: "", color: "#8f8f8f" };
}
