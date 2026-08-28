# sodium integration (generated — fixture variant)

These files mirror what sodium's integration PR generates for a customer
repository (`apps/worker/src/prgen/generator.ts`):

- `bridge.ts` binds approved WebMCP tools to this app's own server actions.
- `SodiumAgent.tsx` renders the loader `<script>` and registers the bridge.
- `manifest-tools.ts` is the approved, published tool set (the platform serves
  this signed from `/api/m/{siteId}`; the fixture serves it from
  `/fixture-manifest` so it works standalone).
- `verify.mjs` checks the bridge still exports a handler per approved contract.

Do not edit by hand in a real integration — regenerate from the dashboard.
The loader registers nothing without a validly signed manifest bound to this
exact origin, and tools are only available to compatible WebMCP browser agents
while the application is open.
