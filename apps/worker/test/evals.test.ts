import { describe, expect, it } from "vitest";
import {
  agentSelectionEval,
  descriptionBudgetEval,
  exampleFromSchema,
  schemaRoundTripEval,
} from "../src/evals";
import type { ActionContract } from "@sodium/contracts";

function contract(overrides: Partial<ActionContract> = {}): ActionContract {
  return {
    contractVersion: 1,
    actionId: "act_0123456789abcdef",
    name: "list_products",
    title: "List products",
    description: "Reads the visible product catalog from the products page.",
    inputSchema: {
      type: "object",
      properties: { category: { type: "string", maxLength: 40 } },
      required: ["category"],
      additionalProperties: false,
    },
    output: { description: "Product list." },
    evidence: [],
    routes: [{ pathPattern: "/products" }],
    auth: { required: false, roles: [] },
    riskLevel: "read_only",
    confirmation: "none",
    handler: {
      kind: "extract",
      fields: [{ name: "names", selector: "[data-name]", all: true }],
    },
    confidence: 0.8,
    ...overrides,
  };
}

describe("exampleFromSchema", () => {
  it("generates conforming examples", () => {
    expect(exampleFromSchema({ type: "string", format: "email" })).toBe(
      "user@example.com",
    );
    expect(
      exampleFromSchema({ type: "integer", minimum: 3, maximum: 10 }),
    ).toBe(3);
    expect(exampleFromSchema({ type: "string", enum: ["a", "b"] })).toBe("a");
    expect(
      exampleFromSchema({
        type: "object",
        properties: { a: { type: "boolean" } },
        required: ["a"],
      }),
    ).toEqual({ a: true });
  });
});

describe("schemaRoundTripEval", () => {
  it("passes for sound schemas", () => {
    expect(schemaRoundTripEval(contract()).passed).toBe(true);
  });

  it("fails for impossible schemas", () => {
    const impossible = contract({
      inputSchema: {
        type: "object",
        properties: { qty: { type: "integer", minimum: 10, maximum: 5 } },
        required: ["qty"],
        additionalProperties: false,
      },
    });
    expect(schemaRoundTripEval(impossible).passed).toBe(false);
  });
});

describe("descriptionBudgetEval", () => {
  it("flags descriptions over the agent budget", () => {
    expect(
      descriptionBudgetEval(contract({ description: "x".repeat(600) })).passed,
    ).toBe(false);
    expect(descriptionBudgetEval(contract()).passed).toBe(true);
  });
});

describe("agentSelectionEval", () => {
  it("flags ambiguous siblings", () => {
    const a = contract();
    const clone = contract({
      actionId: "act_ffffffffffffffff",
      name: "list_products_two",
    });
    expect(agentSelectionEval(a, [a, clone]).passed).toBe(false);
  });

  it("passes distinguishable tools", () => {
    const a = contract();
    const b = contract({
      actionId: "act_ffffffffffffffff",
      name: "cancel_order",
      title: "Cancel an order",
      description:
        "Cancels a pending order for the signed-in customer after confirmation.",
    });
    expect(agentSelectionEval(a, [a, b]).passed).toBe(true);
  });
});
