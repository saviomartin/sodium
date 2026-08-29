/**
 * Minimal, privacy-preserving operational events. By design this NEVER sends
 * tool inputs, tool outputs, or page contents — only event names, tool names
 * (which are already public in the manifest), timing, and coarse status.
 */

export interface Telemetry {
  event(name: string, data?: Record<string, string | number | boolean>): void;
}

const MAX_EVENTS_PER_PAGE = 40;

const ANSWER_ENGINE_HOSTS = [
  ["ChatGPT", ["chatgpt.com", "chat.openai.com"]],
  ["Perplexity", ["perplexity.ai"]],
  ["Claude", ["claude.ai"]],
  ["Gemini", ["gemini.google.com"]],
  ["Copilot", ["copilot.microsoft.com"]],
  ["Grok", ["grok.com"]],
  ["DeepSeek", ["chat.deepseek.com"]],
  ["Mistral", ["chat.mistral.ai"]],
  ["You.com", ["you.com"]],
] as const;

const ANSWER_ENGINE_SOURCE_ALIASES = [
  ["ChatGPT", ["chatgpt", "openai"]],
  ["Perplexity", ["perplexity"]],
  ["Claude", ["claude", "anthropic"]],
  ["Gemini", ["gemini", "google-gemini", "google_ai"]],
  ["Copilot", ["copilot", "microsoft-copilot"]],
  ["Grok", ["grok", "xai"]],
  ["DeepSeek", ["deepseek"]],
  ["Mistral", ["mistral", "le-chat"]],
  ["You.com", ["you", "you-com"]],
] as const;

const ANSWER_ENGINE_SOURCE_KEYS = [
  "utm_source",
  "source",
  "ref",
  "referrer",
] as const;

export interface AnswerEngineAttribution {
  engine: string;
  method: "referrer" | "campaign";
}

/**
 * Identifies human visits referred by a known consumer answer engine. This is
 * intentionally hostname-only: query strings, prompts, and page URLs never
 * leave the customer's browser.
 */
export function answerEngineFromReferrer(referrer: string): string | null {
  if (!referrer) return null;
  let hostname: string;
  try {
    hostname = new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [engine, hosts] of ANSWER_ENGINE_HOSTS) {
    if (
      hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))
    ) {
      return engine;
    }
  }
  return null;
}

function answerEngineFromSourceValue(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const asUrl = normalized.includes("://")
    ? normalized
    : `https://${normalized}`;
  const fromHost = answerEngineFromReferrer(asUrl);
  if (fromHost) return fromHost;

  for (const [engine, aliases] of ANSWER_ENGINE_SOURCE_ALIASES) {
    if (aliases.some((alias) => alias === normalized)) return engine;
  }
  return null;
}

/**
 * Best-effort answer-engine attribution. Browsers can omit referrer data, and
 * WebMCP currently exposes no caller identity, so an explicit landing-page
 * source tag is the only safe fallback. Raw URLs are never returned or sent.
 */
export function answerEngineAttribution(
  referrer: string,
  locationHref: string,
): AnswerEngineAttribution | null {
  const fromReferrer = answerEngineFromReferrer(referrer);
  if (fromReferrer) {
    return { engine: fromReferrer, method: "referrer" };
  }

  let url: URL;
  try {
    url = new URL(locationHref);
  } catch {
    return null;
  }
  for (const key of ANSWER_ENGINE_SOURCE_KEYS) {
    const fromCampaign = answerEngineFromSourceValue(
      url.searchParams.get(key) ?? "",
    );
    if (fromCampaign) {
      return { engine: fromCampaign, method: "campaign" };
    }
  }
  return null;
}

export function createTelemetry(
  endpoint: string | null,
  siteId: string,
  loaderVersion: string,
  win: Window | null,
): Telemetry {
  let sent = 0;
  return {
    event(name, data) {
      if (!endpoint || !win || sent >= MAX_EVENTS_PER_PAGE) return;
      sent++;
      const body = JSON.stringify({
        siteId,
        loader: loaderVersion,
        event: name,
        data: data ?? {},
        ts: Date.now(),
      });
      try {
        if (win.navigator && typeof win.navigator.sendBeacon === "function") {
          const queued = win.navigator.sendBeacon(
            endpoint,
            // A safelisted content type keeps cross-origin Beacon requests from
            // requiring a preflight. The ingest endpoint parses the body as JSON.
            new Blob([body], { type: "text/plain;charset=UTF-8" }),
          );
          if (queued) return;
        }
        if (typeof win.fetch === "function") {
          void win
            .fetch(endpoint, {
              method: "POST",
              body,
              headers: { "content-type": "application/json" },
              keepalive: true,
              credentials: "omit",
            })
            .catch(() => {});
        }
      } catch {
        // Telemetry must never break the host page.
      }
    },
  };
}

export const noopTelemetry: Telemetry = { event: () => {} };
