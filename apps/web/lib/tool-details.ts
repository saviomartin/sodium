import {
  compileTool,
  type HandlerBinding,
  type SodiumTool,
} from "sodium-webmcp-spec";
import type { ToolDetail } from "@/components/tool-details-dialog";
import type { ToolRollup } from "./tool-analytics";

/**
 * How a tool does its work, in one line.
 *
 * `sodium.json` names each mechanism with a single key (`navigate`, `form`,
 * `request`, ...), and that name is the most useful thing to show: it tells a
 * reader whether this tool moves the page, reads it, submits it, or calls the
 * app's own code. The summary beside it is whatever identifies that particular
 * binding, which is the part that differs between two tools of the same kind.
 */
export function describeHandler(handler: HandlerBinding): {
  kind: string;
  summary: string;
} {
  switch (handler.kind) {
    case "navigate":
      return { kind: "navigate", summary: `to ${handler.urlTemplate}` };
    case "extract":
      return {
        kind: "extract",
        summary: `${handler.fields.length} field${handler.fields.length === 1 ? "" : "s"} off the page`,
      };
    case "form":
      return { kind: "form", summary: `fills and submits ${handler.formSelector}` };
    case "interaction":
      return {
        kind: "interaction",
        summary: `${handler.steps.length} step${handler.steps.length === 1 ? "" : "s"} on the page`,
      };
    case "request":
      return {
        kind: "request",
        summary: `${handler.method} ${handler.pathTemplate}`,
      };
    case "call":
      return { kind: "call", summary: `your ${handler.export} export` };
  }
}

/**
 * Joins the deployed contract to what telemetry recorded for it.
 *
 * The contract is the source of truth for which rows exist: a tool that was
 * deployed but never called still needs a row, because "nobody used this" is
 * the finding. Telemetry only fills in the numbers.
 */
export function toolDetails(
  tools: SodiumTool[],
  rollups: ToolRollup[],
): ToolDetail[] {
  const byId = new Map(rollups.map((rollup) => [rollup.id, rollup]));
  return tools.map((tool) => {
    const compiled = compileTool(tool);
    const stats = byId.get(tool.id);
    return {
      id: compiled.id,
      name: compiled.name,
      title: compiled.title,
      description: compiled.description,
      risk: compiled.riskLevel,
      confirmation: compiled.confirmation,
      routes: compiled.routes.map((route) => ({
        pattern: route.pathPattern,
        when: route.requiresSelector,
      })),
      run: describeHandler(compiled.handler),
      input: compiled.inputSchema,
      output: compiled.output ?? null,
      stats: {
        calls: stats?.calls ?? 0,
        successes: stats?.successes ?? 0,
        failures: stats?.failures ?? 0,
        denied: stats?.denied ?? 0,
        successRate: stats?.successRate ?? null,
        p95Ms: stats?.p95Ms ?? null,
      },
    };
  });
}
