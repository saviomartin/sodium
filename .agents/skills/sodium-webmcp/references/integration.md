# Browser integration

Sodium's core SDK is framework-neutral. Choose the smallest native client lifecycle that mounts once, survives client navigation, and cleans up during component teardown or hot reload.

## Required wiring

The browser bootstrap must:

- import `sodium.json` and `.sodium/project.json`;
- import `installSodium` from `sodium-webmcp-sdk`, or render `SodiumProvider` from `sodium-webmcp-sdk/react`;
- pass any real browser-safe handlers used by `call` bindings;
- run only in the browser, at the highest stable application root;
- avoid duplicate mounts and dispose a direct `installSodium` handle during teardown or hot reload.

`init` creates `.sodium/project.json` as `null` so the application remains buildable before its first deployment. Treat the import as `SodiumProject | null`. `deploy` replaces it with the public project credentials; do not invent credentials or edit this file yourself.

## Integration receipt

Write `.sodium/integration.json` after mounting the SDK:

```json
{
  "schemaVersion": 1,
  "strategy": "react-provider",
  "entry": "sodium/Sodium.tsx",
  "mount": "app/layout.tsx"
}
```

- `strategy` is `react-provider` for a rendered `SodiumProvider`; otherwise use `installSodium`.
- `entry` is the project-relative browser source containing the SDK bootstrap. JavaScript, TypeScript, Astro, Svelte, and Vue source files are accepted.
- `mount` is the project-relative source that mounts or auto-loads the bootstrap. It may equal `entry` for framework plugins and inline integrations.
- Both paths must stay inside the project. Do not point at generated output or dependencies.

`npx sodiumtools validate` reads this receipt and verifies the declared source contains the SDK, config, public project file, and actual mount strategy. `deploy` repeats the check before publishing.

## Curated mount points

Use the installed application's structure as the source of truth:

| Application | Preferred browser mount |
| --- | --- |
| Next.js App Router | Small client component rendered once by the root layout |
| Next.js Pages Router | Provider/component rendered by the custom App |
| React with Vite | Provider at the existing React root |
| Nuxt | Client-only plugin loaded by Nuxt |
| SvelteKit | Browser-only setup in the root layout with teardown |
| Astro | Client script or island that accounts for client-side page transitions |
| Angular | Root bootstrap service/component with framework teardown |
| Other browser app | Existing browser entry module with explicit teardown or HMR disposal |

Do not force a React wrapper into a non-React app. Do not add a second application root. When framework conventions or versions differ, inspect the installed version and existing lifecycle code before choosing the mount.
