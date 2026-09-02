import type { Framework } from "./install";

export const CLI_VERSION = "0.2.0";
export const SODIUM_COMMAND = "npx @resultdev/sodium@latest";

export type ResultTone = "success" | "warning" | "info";

export interface CommandResult {
  command: string;
  title: string;
  tone?: ResultTone;
  details?: Array<[label: string, value: string | number]>;
  note?: string;
  prompt?: string;
  promptCopied?: boolean;
  next?: string;
}

export interface HelpCommand {
  name: string;
  description: string;
}

export const HELP_COMMANDS: HelpCommand[] = [
  {
    name: "init [--agent <name>]",
    description: "Install Sodium and create sodium.json",
  },
  { name: "login", description: "Connect this machine to your account" },
  { name: "validate", description: "Check sodium.json before deploying" },
  {
    name: "deploy [--no-open]",
    description: "Publish a version and open its dashboard",
  },
  { name: "doctor", description: "Verify the complete local integration" },
];

export function frameworkName(framework: Framework): string {
  return framework === "next" ? "Next.js" : "React with Vite";
}

export function dashboardUrl(endpoint: string, projectId?: string): string {
  const path = projectId ? `/projects/${projectId}` : "/dashboard";
  return new URL(path, endpoint).toString().replace(/\/$/, "");
}

/** Accessible, deterministic fallback for pipes, CI, snapshots, and dumb terminals. */
export function plainResult(result: CommandResult): string {
  const details = result.details ?? [];
  const width = Math.max(0, ...details.map(([label]) => label.length));
  const symbol =
    result.tone === "warning" ? "!" : result.tone === "info" ? "i" : "✓";
  const lines = [
    `${symbol} Sodium ${result.command} · ${result.title}`,
    ...details.map(
      ([label, value]) => `  ${label.padEnd(width)}  ${String(value)}`,
    ),
  ];
  if (result.note) lines.push("", result.note);
  if (result.prompt) {
    lines.push(
      "",
      result.promptCopied ? "Prompt copied to clipboard:" : "Prompt:",
      result.prompt,
    );
  }
  if (result.next) lines.push("", `Next: ${result.next}`);
  return lines.join("\n");
}
