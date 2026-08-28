// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeTool } from "../src/handlers";
import { registerBridgeHandlers } from "../src/bridge";
import { makeTool } from "./manifest-fixture";

beforeEach(() => {
  document.body.innerHTML = "";
  window.__sodiumBridge?.handlers.clear();
});

describe("input validation gate", () => {
  it("refuses to execute with invalid input", async () => {
    const tool = makeTool({
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", minLength: 1 } },
        required: ["id"],
        additionalProperties: false,
      },
      handler: { kind: "navigate", urlTemplate: "/orders/{id}" },
      riskLevel: "read_only",
    });
    const result = await executeTool(tool, {}, document);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_input");
  });
});

describe("extract handler", () => {
  it("reads text and attributes, single and all", async () => {
    document.body.innerHTML = `
      <ul>
        <li data-name="Widget" data-price="9.99">  Widget  </li>
        <li data-name="Gadget" data-price="19.99">Gadget</li>
      </ul>
      <h1 id="title">Products</h1>
    `;
    const tool = makeTool({
      handler: {
        kind: "extract",
        fields: [
          {
            name: "names",
            selector: "[data-name]",
            attribute: "data-name",
            all: true,
          },
          {
            name: "firstPrice",
            selector: "[data-price]",
            attribute: "data-price",
          },
          { name: "heading", selector: "#title" },
          { name: "missing", selector: ".does-not-exist" },
        ],
      },
    });
    const result = await executeTool(tool, {}, document);
    expect(result).toMatchObject({
      ok: true,
      data: {
        names: ["Widget", "Gadget"],
        firstPrice: "9.99",
        heading: "Products",
        missing: null,
      },
    });
  });
});

describe("form handler", () => {
  it("fills fields (React-compatible) and submits", async () => {
    document.body.innerHTML = `
      <form id="contact">
        <input name="name" type="text" />
        <select name="topic"><option value="support">s</option><option value="sales">x</option></select>
        <textarea name="message"></textarea>
        <button type="submit">Send</button>
      </form>
    `;
    const form = document.querySelector<HTMLFormElement>("#contact")!;
    const submitted = vi.fn();
    const inputEvents: string[] = [];
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitted();
    });
    form.addEventListener("input", (event) => {
      inputEvents.push((event.target as HTMLInputElement).name);
    });

    const tool = makeTool({
      riskLevel: "state_changing",
      confirmation: "recommended",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          topic: { type: "string" },
          message: { type: "string" },
        },
        required: ["name", "message"],
        additionalProperties: false,
      },
      handler: {
        kind: "form",
        formSelector: "#contact",
        fieldMap: { name: "name", topic: "topic", message: "message" },
      },
    });

    const result = await executeTool(
      tool,
      { name: "Ada", topic: "sales", message: "hello there" },
      document,
    );
    expect(result).toMatchObject({ ok: true, submitted: true });
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(form.querySelector<HTMLInputElement>("[name=name]")!.value).toBe(
      "Ada",
    );
    expect(form.querySelector<HTMLSelectElement>("[name=topic]")!.value).toBe(
      "sales",
    );
    expect(inputEvents).toContain("name");
  });

  it("fails when the form is missing", async () => {
    const tool = makeTool({
      riskLevel: "state_changing",
      confirmation: "recommended",
      handler: { kind: "form", formSelector: "#missing", fieldMap: {} },
    });
    const result = await executeTool(tool, {}, document);
    expect(result).toMatchObject({ ok: false, error: "form_not_found" });
  });
});

describe("bridge handler", () => {
  it("dispatches to registered first-party handlers with context", async () => {
    const handler = vi.fn(async (input: unknown) => ({
      canceled: (input as { orderId: string }).orderId,
    }));
    registerBridgeHandlers({ "orders.cancel": handler });

    const tool = makeTool({
      name: "cancel_order",
      riskLevel: "destructive",
      confirmation: "required",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      inputSchema: {
        type: "object",
        properties: { orderId: { type: "string" } },
        required: ["orderId"],
        additionalProperties: false,
      },
      handler: { kind: "bridge", bridgeKey: "orders.cancel" },
    });

    const result = await executeTool(tool, { orderId: "ord_1" }, document);
    expect(result).toMatchObject({ ok: true, result: { canceled: "ord_1" } });
    expect(handler).toHaveBeenCalledWith(
      { orderId: "ord_1" },
      expect.objectContaining({
        toolName: "cancel_order",
        riskLevel: "destructive",
        confirmation: "required",
      }),
    );
  });

  it("fails cleanly when no handler is registered", async () => {
    const tool = makeTool({
      riskLevel: "state_changing",
      confirmation: "recommended",
      handler: { kind: "bridge", bridgeKey: "orders.cancel" },
    });
    const result = await executeTool(tool, {}, document);
    expect(result).toMatchObject({
      ok: false,
      error: "bridge_handler_not_registered",
    });
  });

  it("unregister function removes handlers", async () => {
    const unregister = registerBridgeHandlers({ "cart.add": () => ({}) });
    unregister();
    const tool = makeTool({
      riskLevel: "reversible",
      handler: { kind: "bridge", bridgeKey: "cart.add" },
    });
    const result = await executeTool(tool, {}, document);
    expect(result.ok).toBe(false);
  });
});

describe("navigate handler", () => {
  it("assigns a filled same-origin path", async () => {
    const assign = vi.fn();
    const fakeDoc = {
      defaultView: { location: { assign } },
    } as unknown as Document;
    const tool = makeTool({
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
      handler: { kind: "navigate", urlTemplate: "/products/{id}" },
    });
    const result = await executeTool(tool, { id: "p1" }, fakeDoc);
    expect(result.ok).toBe(true);
    expect(assign).toHaveBeenCalledWith("/products/p1");
  });
});
