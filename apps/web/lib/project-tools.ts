import {
  annotationsForRisk,
  type ActionContract,
  type PublishedTool,
} from "@sodium/contracts";

/**
 * Projects transport-neutral contracts onto the published manifest shape.
 * Pure module — unit-tested directly.
 */
export function projectTools(contracts: ActionContract[]): PublishedTool[] {
  return contracts.map((contract) => ({
    name: contract.name,
    title: contract.title,
    description: contract.description,
    inputSchema: contract.inputSchema,
    annotations: annotationsForRisk(contract.riskLevel),
    riskLevel: contract.riskLevel,
    confirmation: contract.confirmation,
    routes: contract.routes,
    handler: contract.handler,
  }));
}
