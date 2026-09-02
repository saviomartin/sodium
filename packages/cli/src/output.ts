import type { Framework } from "./install";

export const SODIUM_COMMAND = "npx sodium-webmcp@latest";

export function frameworkName(framework: Framework): string {
  return framework === "next" ? "Next.js" : "React with Vite";
}

export function dashboardUrl(endpoint: string, projectId?: string): string {
  const path = projectId ? `/projects/${projectId}` : "/dashboard";
  return new URL(path, endpoint).toString().replace(/\/$/, "");
}

export function successMessage(
  title: string,
  details: Array<[label: string, value: string | number]>,
  next?: string,
): string {
  const width = Math.max(0, ...details.map(([label]) => label.length));
  const lines = [
    `✓ ${title}`,
    "",
    ...details.map(
      ([label, value]) => `  ${label.padEnd(width)}  ${String(value)}`,
    ),
  ];
  if (next) lines.push("", `Next: ${next}`);
  return lines.join("\n");
}
