# Marketing shots

Screenshots rendered from real app markup — same tokens, fonts, ASCII backdrop
and components as `apps/web`, so the images can't drift from the product.

```bash
node marketing/shoot.mjs one-line.html out/one-line-4x3.png 1200 900 2
#                        page          output              w    h   dpr
```

- `lib/shell.css` — tokens + component styles copied from `app/globals.css`,
  `components/ui.tsx` and `components/copy-snippet.tsx`.
- `lib/ascii.js` — `components/ascii-backdrop.tsx`, frozen at one frame.
- `assets/` — Geist Sans/Mono (from the Next build) and the Result logo.

New shot: copy `one-line.html`, keep the `.stage` size at the aspect ratio you
want (1200×900 = 4:3, 1200×675 = 16:9), and set `dataset.ready` when painting
finishes — `shoot.mjs` waits on it.

## App screenshots

`shoot-app.mjs` shoots the running dev server, so the image is the real UI:

```bash
node marketing/shoot-app.mjs "/auth/analytics-preview-tmp?shot=overview" \
  out/analytics-1-overview.png 1600 900 2 900 http://localhost:3000
#  route                                     output  w    h   dpr clip origin
```

Use `http://localhost:3000`, not `127.0.0.1` — Next dev serves its chunks 403
to a mismatched origin and the page renders without its client JS (no ASCII
backdrop). The last arg to `clip` keeps the frame at an exact aspect ratio.

`fit.mjs` prints each shot's rendered content height and the viewport that
makes it fill a 16:9 frame — pick the width from it, then pass a matching
`dpr` so the output lands on 3200x1800.

`apps/web/app/auth/analytics-preview-tmp/page.tsx` is a throwaway route that
renders the real `AgentAnalyticsDashboard` against a fixture, with
`?shot=overview|tools|engines|full` picking which panels stay visible. It sits
under `/auth/` because that prefix is public in `lib/supabase/proxy.ts`.
Delete the route once the shots are taken.
