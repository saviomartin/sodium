/**
 * Test-only probe for agent-browser's --init-script option.
 *
 * Production tools are registered by the app itself in
 * apps/web/components/native-webmcp-tools.tsx. This probe intentionally does
 * not register, replace, or polyfill any tool.
 */
(() => {
  const expected = [
    "sodium_authorize_cli",
    "sodium_delete_account",
    "sodium_delete_project",
    "sodium_get_app_state",
    "sodium_get_deployed_tool",
    "sodium_get_project",
    "sodium_list_projects",
    "sodium_navigate",
    "sodium_open_project",
    "sodium_sign_in",
    "sodium_sign_out",
  ];

  Object.defineProperty(window, "__sodiumNativeWebMcpEval", {
    configurable: true,
    value: {
      expected,
      async check() {
        const context = document.modelContext;
        if (!context || typeof context.getTools !== "function") {
          return { ok: false, error: "native_webmcp_unavailable" };
        }
        const names = (await context.getTools()).map((tool) => tool.name).sort();
        return {
          ok:
            names.length === expected.length &&
            names.every((name, index) => name === expected[index]),
          names,
        };
      },
    },
  });
})();
