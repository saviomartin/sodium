import { sha256Hex, type StaticAnalysis } from "@sodium/analyzer";
import { stableActionId } from "@sodium/analyzer";
import {
  ActionContractSchema,
  CONTRACT_VERSION,
  type ActionContract,
  type Evidence,
} from "@sodium/contracts";
import type { PrimitiveRef, ProposedTool } from "../providers/ai-provider";

/**
 * Builds the numbered primitive list shared by AI synthesis (as citable
 * evidence) and by sync comparison (as ground truth).
 */
export function buildPrimitives(analysis: StaticAnalysis): PrimitiveRef[] {
  const primitives: PrimitiveRef[] = [];
  const push = (
    kind: PrimitiveRef["kind"],
    summary: string,
    detail: Record<string, unknown>,
  ) => {
    primitives.push({ index: primitives.length, kind, summary, detail });
  };

  for (const route of analysis.routes) {
    if (route.kind !== "page") continue;
    push(
      "page",
      `page ${route.urlPattern} (${route.span.filePath})`,
      route as unknown as Record<string, unknown>,
    );
  }
  for (const form of analysis.forms) {
    push(
      "form",
      `form on ${form.urlPattern ?? "unknown route"} → ${form.action.kind === "server_action" ? form.action.name : form.action.kind}`,
      form as unknown as Record<string, unknown>,
    );
  }
  for (const link of analysis.links ?? []) {
    push(
      "link",
      `link ${link.label ? `"${link.label}" ` : ""}to ${link.href} (${link.span.filePath})`,
      link as unknown as Record<string, unknown>,
    );
  }
  for (const action of analysis.serverActions) {
    push(
      "server_action",
      `server action ${action.name}(${action.params.join(", ")}) in ${action.span.filePath}`,
      action as unknown as Record<string, unknown>,
    );
  }
  for (const handler of analysis.routeHandlers) {
    push(
      "route_handler",
      `${handler.method} ${handler.urlPattern} in ${handler.span.filePath}`,
      handler as unknown as Record<string, unknown>,
    );
  }
  return primitives;
}

/** Converts a cited primitive into contract evidence. */
function evidenceFromPrimitive(primitive: PrimitiveRef): Evidence | null {
  const span = (
    primitive.detail as {
      span?: { filePath: string; startLine: number; endLine: number };
    }
  ).span;
  const excerpt = String(
    (primitive.detail as { excerpt?: string }).excerpt ?? primitive.summary,
  ).slice(0, 2000);
  if (!span) return null;
  const primitiveKind =
    primitive.kind === "page"
      ? "route"
      : primitive.kind === "form"
        ? "form"
        : primitive.kind === "link"
          ? "route"
          : primitive.kind;
  return {
    kind: "source",
    primitive: primitiveKind as
      "route" | "form" | "server_action" | "route_handler",
    filePath: span.filePath,
    startLine: span.startLine,
    endLine: span.endLine,
    snippetSha256: sha256Hex(excerpt),
    excerpt,
    summary: primitive.summary.slice(0, 500),
  };
}

export interface AssembledCandidate {
  contract: ActionContract;
  reasoning: string;
}

/**
 * Deterministically assembles a full ActionContract from an AI proposal:
 * stable id from the primary evidence coordinates, resolved evidence list,
 * and schema-parsed structure. Throws ZodError for unusable proposals —
 * callers count those as rejected proposals, not crashes.
 */
export function assembleContract(
  repositoryId: string,
  proposal: ProposedTool,
  primitives: PrimitiveRef[],
): AssembledCandidate {
  const cited = proposal.evidenceRefs
    .map((ref) => primitives[ref])
    .filter((p): p is PrimitiveRef => p !== undefined);
  const evidence = cited
    .map((primitive) => evidenceFromPrimitive(primitive))
    .filter((e): e is Evidence => e !== null)
    .slice(0, 16);

  const actionId = stableActionId(
    repositoryId,
    proposal.handler.kind,
    capabilityTarget(proposal),
  );

  const contract = ActionContractSchema.parse({
    contractVersion: CONTRACT_VERSION,
    actionId,
    name: proposal.name,
    title: proposal.title,
    description: proposal.description,
    inputSchema: proposal.inputSchema,
    output: { description: proposal.outputDescription },
    evidence,
    routes: proposal.routes,
    auth: { required: proposal.authRequired, roles: proposal.roles },
    riskLevel: proposal.riskLevel,
    confirmation: proposal.confirmation,
    handler: proposal.handler,
    confidence: proposal.confidence,
  });
  return { contract, reasoning: proposal.reasoning };
}

function capabilityTarget(proposal: ProposedTool): string {
  switch (proposal.handler.kind) {
    case "navigate":
      return proposal.handler.urlTemplate;
    case "form":
      return `${proposal.handler.formSelector}\u0000${proposal.routes
        .map((route) => route.pathPattern)
        .sort()
        .join("\u0000")}`;
    case "bridge":
      return proposal.handler.bridgeKey;
    case "extract":
      return proposal.handler.fields
        .map(
          (field) =>
            `${field.name}:${field.selector}:${field.attribute ?? "text"}`,
        )
        .sort()
        .join("\u0000");
  }
}
