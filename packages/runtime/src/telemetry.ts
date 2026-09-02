export const SDK_VERSION = "0.2.0";

export type SodiumEventName =
  | "sdk_ready"
  | "answer_engine_referral"
  | "tool_registered"
  | "tool_register_failed"
  | "tool_started"
  | "tool_succeeded"
  | "tool_failed"
  | "confirmation_denied";

export interface TelemetryContext {
  endpoint: string;
  projectId: string;
  publishableKey: string;
  deploymentId?: string;
  configVersion?: number;
}

export interface Telemetry {
  event(
    name: SodiumEventName,
    fields?: {
      toolId?: string;
      toolName?: string;
      invocationId?: string;
      durationMs?: number;
      errorCode?: string;
      answerEngine?: AnswerEngineName;
      attributionMethod?: AnswerEngineAttributionMethod;
    },
  ): void;
}

const MAX_EVENTS_PER_PAGE = 100;
const SESSION_STORAGE_KEY = "sodium.session.v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ANSWER_ENGINE_SOURCES = [
  {
    name: "ChatGPT",
    hosts: ["chatgpt.com", "chat.openai.com"],
    campaigns: ["chatgpt", "openai", "chatgpt.com", "chat.openai.com"],
  },
  {
    name: "Claude",
    hosts: ["claude.ai"],
    campaigns: ["claude", "anthropic", "claude.ai"],
  },
  {
    name: "Perplexity",
    hosts: ["perplexity.ai"],
    campaigns: ["perplexity", "perplexity.ai"],
  },
  {
    name: "Gemini",
    hosts: ["gemini.google.com"],
    campaigns: ["gemini", "google-gemini", "gemini.google.com"],
  },
  {
    name: "Copilot",
    hosts: ["copilot.microsoft.com"],
    campaigns: ["copilot", "microsoft-copilot", "copilot.microsoft.com"],
  },
  {
    name: "Grok",
    hosts: ["grok.com"],
    campaigns: ["grok", "xai", "grok.com"],
  },
  {
    name: "DeepSeek",
    hosts: ["chat.deepseek.com"],
    campaigns: ["deepseek", "chat.deepseek.com"],
  },
  {
    name: "Mistral",
    hosts: ["chat.mistral.ai"],
    campaigns: ["mistral", "le-chat", "chat.mistral.ai"],
  },
  {
    name: "You.com",
    hosts: ["you.com"],
    campaigns: ["you", "you.com"],
  },
] as const;

export type AnswerEngineName = (typeof ANSWER_ENGINE_SOURCES)[number]["name"];
export type AnswerEngineAttributionMethod = "referrer" | "campaign";

export interface AnswerEngineAttribution {
  answerEngine: AnswerEngineName;
  attributionMethod: AnswerEngineAttributionMethod;
}

const CAMPAIGN_PARAMETERS = ["utm_source", "source", "ref", "referrer"];

function hostMatches(hostname: string, expected: string): boolean {
  return hostname === expected || hostname.endsWith(`.${expected}`);
}

function answerEngineFromHost(hostname: string): AnswerEngineName | null {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    ANSWER_ENGINE_SOURCES.find((source) =>
      source.hosts.some((host) => hostMatches(normalized, host)),
    )?.name ?? null
  );
}

function campaignToken(value: string): string {
  const normalized = value.trim().toLowerCase();
  try {
    return new URL(normalized).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return normalized;
  }
}

function answerEngineFromCampaign(value: string): AnswerEngineName | null {
  const normalized = campaignToken(value);
  return (
    ANSWER_ENGINE_SOURCES.find((source) =>
      source.campaigns.some((campaign) => campaign === normalized),
    )?.name ?? null
  );
}

export function answerEngineAttribution(
  win: Window,
  doc: Document = win.document,
): AnswerEngineAttribution | null {
  if (doc.referrer) {
    try {
      const answerEngine = answerEngineFromHost(new URL(doc.referrer).hostname);
      if (answerEngine) {
        return { answerEngine, attributionMethod: "referrer" };
      }
    } catch {
      // A malformed referrer is ignored and campaign attribution is attempted.
    }
  }

  try {
    const search = new URL(win.location.href).searchParams;
    for (const parameter of CAMPAIGN_PARAMETERS) {
      const value = search.get(parameter);
      if (!value) continue;
      const answerEngine = answerEngineFromCampaign(value);
      if (answerEngine) {
        return { answerEngine, attributionMethod: "campaign" };
      }
    }
  } catch {
    // Location access can fail in sandboxed documents; telemetry stays inert.
  }
  return null;
}

function randomUuid(win: Window): string {
  if (typeof win.crypto?.randomUUID === "function") {
    return win.crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (digit) =>
    (
      Number(digit) ^
      (win.crypto.getRandomValues(new Uint8Array(1))[0]! &
        (15 >> (Number(digit) / 4)))
    ).toString(16),
  );
}

function sessionId(win: Window): string {
  try {
    const existing = win.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing && UUID_PATTERN.test(existing)) return existing;
    const created = randomUuid(win);
    win.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return randomUuid(win);
  }
}

export function createTelemetry(
  context: TelemetryContext | null,
  win: Window | null,
): Telemetry {
  let sent = 0;
  const anonymousSessionId = win ? sessionId(win) : undefined;
  return {
    event(name, fields = {}) {
      if (!context || !win || sent >= MAX_EVENTS_PER_PAGE) return;
      sent++;
      const body = JSON.stringify({
        projectId: context.projectId,
        key: context.publishableKey,
        deploymentId: context.deploymentId,
        configVersion: context.configVersion,
        sdkVersion: SDK_VERSION,
        sessionId: anonymousSessionId,
        event: name,
        ...fields,
        ts: Date.now(),
      });
      try {
        if (typeof win.navigator?.sendBeacon === "function") {
          const queued = win.navigator.sendBeacon(
            new URL("/api/events", context.endpoint).toString(),
            new Blob([body], { type: "text/plain;charset=UTF-8" }),
          );
          if (queued) return;
        }
        void win
          .fetch(new URL("/api/events", context.endpoint), {
            method: "POST",
            body,
            headers: { "content-type": "text/plain;charset=UTF-8" },
            keepalive: true,
            credentials: "omit",
          })
          .catch(() => {});
      } catch {
        // Analytics must never affect the host application.
      }
    },
  };
}

export const noopTelemetry: Telemetry = { event: () => {} };
