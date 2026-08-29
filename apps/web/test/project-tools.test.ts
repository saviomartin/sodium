import { describe, expect, it } from "vitest";
import { PublishedToolSchema, type ActionContract } from "@sodium/contracts";
import { projectTools } from "../lib/project-tools";

const contract: ActionContract = {
  contractVersion: 2,
  actionId: "act_0123456789abcdef",
  name: "cancel_order",
  title: "Cancel an order",
  description:
    "Cancels a pending order through the application's own action after explicit confirmation.",
  inputSchema: {
    type: "object",
    properties: { orderId: { type: "string" } },
    required: ["orderId"],
    additionalProperties: false,
  },
  output: { description: "Cancellation result." },
  evidence: [],
  routes: [{ pathPattern: "/orders" }],
  auth: { required: true, roles: [] },
  riskLevel: "destructive",
  confirmation: "required",
  handler: {
    kind: "interaction",
    steps: [{ kind: "click", selector: "#cancel-order" }],
  },
  confidence: 0.8,
};

describe("projectTools", () => {
  it("produces schema-valid published tools with derived annotations", () => {
    const [tool] = projectTools([contract]);
    expect(PublishedToolSchema.safeParse(tool).success).toBe(true);
    expect(tool!.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    });
    expect(tool!.confirmation).toBe("required");
  });

  it("never carries evidence or internal fields into the manifest", () => {
    const [tool] = projectTools([contract]);
    expect(tool).not.toHaveProperty("evidence");
    expect(tool).not.toHaveProperty("confidence");
    expect(tool).not.toHaveProperty("actionId");
  });
});
