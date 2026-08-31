import type { AuthSignalInfo, AuthSignalKind } from "../types";

/**
 * Framework-neutral auth-signal detection over source text. Signals are evidence for
 * reviewers and the synthesis stage — they are never treated as enforcement.
 */

interface SignalPattern {
  kind: AuthSignalKind;
  pattern: RegExp;
  detail: string;
}

const SIGNAL_PATTERNS: SignalPattern[] = [
  {
    kind: "supabase_get_claims",
    pattern: /\.auth\.getClaims\s*\(/g,
    detail: "supabase.auth.getClaims()",
  },
  {
    kind: "supabase_get_user",
    pattern: /\.auth\.getUser\s*\(/g,
    detail: "supabase.auth.getUser()",
  },
  {
    kind: "next_auth",
    pattern: /getServerSession\s*\(/g,
    detail: "next-auth getServerSession()",
  },
  {
    kind: "next_auth",
    pattern: /from\s+["']next-auth/g,
    detail: "next-auth import",
  },
  { kind: "clerk", pattern: /from\s+["']@clerk\//g, detail: "@clerk import" },
  {
    kind: "session_cookie",
    pattern:
      /cookieStore\.get\(\s*["'][^"']*(session|token|auth)[^"']*["']\s*\)|cookies\(\)\s*\)?\.get\(\s*["'][^"']*(session|token|auth)[^"']*["']/gi,
    detail: "session cookie read",
  },
  {
    kind: "redirect_guard",
    pattern:
      /redirect\(\s*["'][^"']*(login|signin|sign-in|auth)[^"']*["']\s*\)/gi,
    detail: "redirect to auth page",
  },
];

export function detectAuthSignals(
  filePath: string,
  text: string,
): AuthSignalInfo[] {
  const signals: AuthSignalInfo[] = [];
  const isProxy = /^(src\/)?(proxy|middleware)\.(ts|js)$/.test(filePath);
  if (isProxy) {
    signals.push({
      kind: "proxy_middleware",
      span: { filePath, startLine: 1, endLine: 1 },
      detail: "request-level proxy/middleware present",
    });
  }
  for (const { kind, pattern, detail } of SIGNAL_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const line = text.slice(0, match.index).split("\n").length;
      signals.push({
        kind,
        span: { filePath, startLine: line, endLine: line },
        detail,
      });
      if (signals.length > 200) return signals; // pathological file guard
    }
  }
  return signals;
}

/** Signals within a line range (for scoping file signals to one function). */
export function signalsWithin(
  signals: AuthSignalInfo[],
  startLine: number,
  endLine: number,
): AuthSignalInfo[] {
  return signals.filter(
    (s) => s.span.startLine >= startLine && s.span.endLine <= endLine,
  );
}
