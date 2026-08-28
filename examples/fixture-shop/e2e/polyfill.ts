/**
 * Test polyfill for the WebMCP surface targeted by @sodium/runtime, mirroring
 * the W3C WebML CG draft as of Aug 2026 (document.modelContext, registerTool
 * with AbortSignal unregistration, duplicate names reject). Injected with
 * addInitScript so it exists before the loader runs — this pins the exact API
 * the loader must speak, hermetically.
 */
export const WEBMCP_POLYFILL = `
(() => {
  const tools = new Map();
  const modelContext = {
    async registerTool(tool, options) {
      if (!tool || typeof tool.name !== "string" || !tool.name) throw new TypeError("invalid tool");
      if (typeof tool.description !== "string" || !tool.description) throw new TypeError("missing description");
      if (typeof tool.execute !== "function") throw new TypeError("missing execute");
      if (tools.has(tool.name)) throw new DOMException("duplicate tool: " + tool.name, "InvalidStateError");
      tools.set(tool.name, tool);
      if (options && options.signal) {
        options.signal.addEventListener("abort", () => { tools.delete(tool.name); });
      }
    },
    async getTools() {
      return [...tools.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
    async executeTool(name, input) {
      const tool = tools.get(name);
      if (!tool) throw new DOMException("no such tool: " + name, "NotFoundError");
      const result = await tool.execute(input ?? {}, { signal: new AbortController().signal });
      return JSON.stringify(result);
    },
  };
  Object.defineProperty(document, "modelContext", { value: modelContext, configurable: true });
  // Test inspection surface:
  window.__wmcp = {
    names: () => [...tools.keys()].sort(),
    tool: (name) => tools.get(name),
    execute: (name, input) => modelContext.executeTool(name, input),
  };
})();
`;
