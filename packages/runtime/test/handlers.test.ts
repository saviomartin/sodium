// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeTool } from "../src/handlers";
import { makeTool } from "./tool-fixture";

beforeEach(() => {
  document.body.innerHTML = "";
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

describe("loader-native handlers", () => {
  it("enforces confirmation before a destructive interaction", async () => {
    document.body.innerHTML = `<button id="cancel">Cancel order</button>`;
    const clicked = vi.fn();
    document.querySelector("#cancel")!.addEventListener("click", clicked);
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
      handler: {
        kind: "interaction",
        steps: [{ kind: "click", selector: "#cancel" }],
      },
    });
    const execution = executeTool(tool, { orderId: "ord_1" }, document);
    await vi.waitFor(() =>
      expect(document.querySelector("[data-sodium-confirm]")).not.toBeNull(),
    );
    expect(clicked).not.toHaveBeenCalled();
    (
      document.querySelector("[data-sodium-confirm]") as HTMLButtonElement
    ).click();
    await expect(execution).resolves.toMatchObject({ ok: true });
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("returns user_denied without executing", async () => {
    document.body.innerHTML = `<button id="cancel">Cancel order</button>`;
    const clicked = vi.fn();
    document.querySelector("#cancel")!.addEventListener("click", clicked);
    const tool = makeTool({
      riskLevel: "destructive",
      confirmation: "required",
      handler: {
        kind: "interaction",
        steps: [{ kind: "click", selector: "#cancel" }],
      },
    });
    const execution = executeTool(tool, {}, document);
    await vi.waitFor(() =>
      expect(document.querySelector("[data-sodium-cancel]")).not.toBeNull(),
    );
    (
      document.querySelector("[data-sodium-cancel]") as HTMLButtonElement
    ).click();
    await expect(execution).resolves.toMatchObject({
      ok: false,
      error: "user_denied",
    });
    expect(clicked).not.toHaveBeenCalled();
  });

  it("waits for framework-rendered interaction postconditions", async () => {
    document.body.innerHTML = `<button id="clear">Clear</button><div id="pending"></div>`;
    document.querySelector("#clear")!.addEventListener("click", () => {
      setTimeout(() => document.querySelector("#pending")?.remove(), 0);
    });
    const tool = makeTool({
      riskLevel: "reversible",
      handler: {
        kind: "interaction",
        steps: [{ kind: "click", selector: "#clear" }],
        postcondition: { kind: "selector_absent", selector: "#pending" },
      },
    });

    await expect(executeTool(tool, {}, document)).resolves.toMatchObject({
      ok: true,
    });
  });

  it("fails closed when an interaction selector is ambiguous", async () => {
    document.body.innerHTML = `<button class="cancel">One</button><button class="cancel">Two</button>`;
    const tool = makeTool({
      riskLevel: "state_changing",
      confirmation: "recommended",
      handler: {
        kind: "interaction",
        steps: [{ kind: "click", selector: ".cancel" }],
      },
    });
    await expect(executeTool(tool, {}, document)).resolves.toMatchObject({
      ok: false,
      error: "selector_not_unique",
    });
  });

  it("clicks one exact accessible-name button and rejects duplicates", async () => {
    document.body.innerHTML = `<button>Sign out</button>`;
    const clicked = vi.fn();
    document.querySelector("button")!.addEventListener("click", clicked);
    const tool = makeTool({
      riskLevel: "state_changing",
      confirmation: "recommended",
      handler: {
        kind: "interaction",
        steps: [{ kind: "click", role: "button", name: "Sign out" }],
      },
    });
    await expect(executeTool(tool, {}, document)).resolves.toMatchObject({
      ok: true,
    });
    expect(clicked).toHaveBeenCalledTimes(1);

    document.body.innerHTML = `<button>Sign out</button><button aria-label="Sign out">Exit</button>`;
    await expect(executeTool(tool, {}, document)).resolves.toMatchObject({
      ok: false,
      error: "accessible_target_not_unique",
    });
  });

  it("runs a constrained same-origin request", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ added: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    window.fetch = fetchMock as typeof fetch;
    const tool = makeTool({
      riskLevel: "reversible",
      inputSchema: {
        type: "object",
        properties: { productId: { type: "string" } },
        required: ["productId"],
        additionalProperties: false,
      },
      handler: {
        kind: "request",
        method: "POST",
        pathTemplate: "/api/cart",
        body: { encoding: "json", fieldMap: { productId: "productId" } },
        response: "json",
      },
    });
    const result = await executeTool(tool, { productId: "p1" }, document);
    expect(result).toMatchObject({ ok: true, data: { added: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/api/cart" }),
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        redirect: "error",
        body: JSON.stringify({ productId: "p1" }),
      }),
    );
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

describe("custom call handler", () => {
  it("invokes an explicitly provided local handler", async () => {
    const tool = makeTool({
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
      handler: { kind: "call", export: "openProduct" },
    });
    const result = await executeTool(tool, { id: "p1" }, document, undefined, {
      openProduct: async ({ id }) => ({ opened: id }),
    });
    expect(result).toEqual({ ok: true, data: { opened: "p1" } });
  });

  it("fails clearly when the export is absent", async () => {
    const tool = makeTool({ handler: { kind: "call", export: "missing" } });
    await expect(executeTool(tool, {}, document)).resolves.toMatchObject({
      ok: false,
      error: "handler_not_registered",
    });
  });
});
