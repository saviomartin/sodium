import { describe, expect, it } from "vitest";
import { compileLocalConfig } from "../src/config";

describe("browser config compiler", () => {
  it("applies authoring defaults without bundling Zod", () => {
    const compiled = compileLocalConfig({
      schemaVersion: 1,
      app: { name: "Shop", origins: ["https://shop.example"] },
      tools: [
        {
          id: "tl_abcdefgh",
          name: "open_cart",
          description: "Open the current shopping cart for this application.",
          run: { navigate: "/cart" },
          risk: "read_only",
        },
      ],
    });
    expect(compiled).toMatchObject({
      telemetry: { enabled: true },
      tools: [
        {
          routes: [{ pathPattern: "/**" }],
          inputSchema: { properties: {}, required: [] },
        },
      ],
    });
  });

  it("enforces the confirmation floor even for an undeployed local edit", () => {
    const compiled = compileLocalConfig({
      schemaVersion: 1,
      app: { name: "Shop", origins: ["https://shop.example"] },
      tools: [
        {
          id: "tl_abcdefgh",
          name: "place_order",
          description:
            "Place the current order and charge its selected payment method.",
          run: { call: "placeOrder" },
          risk: "financial",
          confirmation: "none",
        },
      ],
    });
    expect(compiled?.tools[0]?.confirmation).toBe("required");
  });
});
