# Browser React support

Sodium accepts Next.js App Router repositories and browser React applications.
Repository connection, billing, review, publication, manifests, and the hosted
loader are framework-neutral; framework selection happens only inside the
read-only analyzer.

## Architecture

```text
GitHub snapshot
  -> RepoWorkspace trust boundary
  -> framework selector
       -> NextJsAnalyzer
       -> ReactAnalyzer
  -> shared StaticAnalysis primitives
  -> deterministic synthesis + AI wording
  -> validation, review, publication, loader
```

`selectFrameworkAnalyzer()` gives Next.js precedence when a valid App Router
directory exists. Otherwise it looks for a runnable browser React package. Both
adapters emit the same `StaticAnalysis` contract: pages, forms, links, controls,
schemas, auth evidence, warnings, and scan statistics. The worker, AI provider,
sync comparison, database rows, manifests, and runtime do not branch by
framework.

Shared code owns TypeScript/JSX parsing, import traversal, form/link/control
extraction, Zod conversion, authentication signals, deduplication, and selector
safety. Framework adapters own only project detection and route conventions.

## React project detection

A package is a browser React application only when all of these are true:

1. `package.json` declares `react` and `react-dom`.
2. It is not a Next.js package; the Next.js adapter runs first.
3. A web entry point is statically found through `index.html`, a declared
   `source`/`browser` entry, common `src/main` or `src/index` files, or a
   React DOM mount call.
4. It has browser-app evidence from Vite, Create React App, Rsbuild, Parcel,
   Webpack, an HTML entry, or `createRoot`/`hydrateRoot`/legacy
   `ReactDOM.render`.

This rejects component libraries, React Native-only packages, non-React repos,
and dependency-only workspace roots. A monorepo containing one React app is
selected automatically. Multiple independent React apps fail with their exact
roots instead of silently mixing routes and tools from different sites.

The detector recognizes the build tools the React team recommends for apps
built without a full-stack framework: Vite, Parcel, and Rsbuild. Existing
Create React App repositories remain supported even though CRA is deprecated.
See the [React deprecation notice](https://react.dev/blog/2025/02/14/sunsetting-create-react-app)
and [Vite templates](https://vite.dev/guide/).

## Routing support

Routerless applications receive a `/` page primitive and global `/**` bindings
for rendered forms and controls, so an app mounted below the origin root still
works.

React Router declarative and data modes support:

- `<Routes>` / `<Route>`, `createRoutesFromElements`, `createBrowserRouter`,
  `createHashRouter`, and `useRoutes`;
- route arrays declared locally or imported through default/named imports;
- nested, layout, index, absolute, relative, dynamic `:param`, optional `?`,
  and trailing splat `*` routes;
- statically declared `basename` values;
- `element`, `Component`, and statically resolvable lazy imports;
- `Link` and `NavLink`, including safe static relative destinations.

React Router documents these forms in its
[declarative routing](https://reactrouter.com/start/declarative/routing) and
[data routing](https://reactrouter.com/start/data/routing) guides.

Hash routes are represented as `/#/path`. The runtime matches the hash path,
listens for `hashchange`, and re-registers tools after hash navigation. Splat
pages scope controls correctly but do not become navigation tools because an
arbitrary multi-segment destination cannot be filled safely.

Dynamic/computed route paths, children, or complete route configurations are
not guessed. If React Router is present but no route tree can be resolved, the
run fails once with `parse_failed` instead of retrying or publishing root-bound
tools that may execute on the wrong screen.

Known alternative routers (including TanStack Router, Wouter, Reach Router,
Universal Router, Hookrouter, and React Location), mixed browser/hash routers,
and multiple static basenames also fail closed. They are never mislabeled as a
routerless single-page app.

## Browser capability extraction

- Native forms and React Router `<Form>` are supported.
- `action={fn}` and `onSubmit={fn}` become client event-handler evidence;
  the loader fills real DOM fields and calls the page's normal submission path.
- Passwords, files, OTPs, CAPTCHA fields, hidden values, and ambiguous forms
  remain excluded under the existing trust policy.
- Destructive or financial handler names retain the deterministic confirmation
  floor; React client handlers cannot bypass the risk ladder.
- Native anchors, `Link`, and `NavLink` must resolve to same-origin static paths.
- Buttons require a stable selector, a literal exact accessible name, or an
  action-derived label paired with a stable selector.
- JSX labels containing runtime expressions are never treated as exact
  accessible names. For example, `Count is {count}` is excluded unless the
  control has an `id`, `name`, data attribute, or stable `aria-label`.

Repository source is still never installed, built, imported, or executed by
the analyzer. Only the separate QA fixtures are run in a browser.

## Edge-case contract

| Scenario                              | Behavior                                                            |
| ------------------------------------- | ------------------------------------------------------------------- |
| Vite JS/TS/React Compiler             | Detect and analyze from `index.html` plus `src/main.*`              |
| Create React App                      | Detect from `react-scripts` plus `src/index.*`                      |
| Rsbuild / Parcel / Webpack            | Detect from package scripts/dependencies and static entry evidence  |
| One React app in a monorepo           | Select its package root                                             |
| Multiple React apps                   | Fail with the candidate roots; never combine them                   |
| Component library                     | Reject: no runnable browser entry                                   |
| React Native / Expo without React DOM | Reject                                                              |
| Preact without React                  | Reject rather than misclassify                                      |
| Next.js App Router                    | Continue through the existing Next.js adapter                       |
| Next.js Pages-only app                | Remains unsupported; never falls through as vanilla React           |
| BrowserRouter basename                | Prefix routes and link destinations                                 |
| HashRouter                            | Match `/#/...` and re-sync on hash changes                          |
| Optional route segment                | Emit both concrete variants, capped to prevent combinatorial growth |
| Splat route                           | Scope with `**`; do not synthesize unsafe navigation                |
| Imported static route array           | Resolve through local default/named imports                         |
| Computed route config/path            | Fail closed with `parse_failed`                                     |
| Unsupported or mixed router           | Fail closed; never bind every tool globally                         |
| Relative link on a dynamic route      | Skip when a concrete destination cannot be proven                   |
| Dynamic button label                  | Require a stable selector/label; never publish a partial name       |
| Client `onSubmit` form                | Submit through existing React behavior                              |
| Sensitive form fields                 | Exclude the form from executable tools                              |
| Unsupported repository                | One non-retryable, actionable framework error                       |

## Verification matrix

Automated coverage lives in `packages/analyzer/test/react-analyzer.test.ts`,
the worker synthesis tests, and runtime loader tests. Release acceptance is:

1. Analyzer fixtures pass for Vite, CRA-style, nested/data/hash React Router,
   basename, optional/splat routes, imported routes, monorepos, and fail-closed
   cases.
2. Next.js analyzer regression tests remain unchanged and green.
3. Worker tests prove React parameters, client forms, confirmation floors,
   candidate coverage, sync compatibility, and hosted database invariants.
4. Runtime tests prove hash-route registration and normal SPA re-registration.
5. Current official Vite, Create React App, and Rsbuild templates are analyzed
   as external snapshots; at least one stable extracted control is executed in
   a real browser and its visible state change is verified.
