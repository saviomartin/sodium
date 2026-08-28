# Sodium — local testing plan

A complete, ordered plan: automated baseline first, then a visual walkthrough
of every feature — dashboard, pipeline, review, publication, rollback, PR
generation, the WebMCP runtime on the fixture shop, continuous sync, and the
security fail-closed paths.

All commands run from the repo root unless noted. Everything runs against the
linked hosted Supabase project (`sodium`, ref `wsacbkkbvkcuqgiagxms`) — no
Docker anywhere.

---

## Part 0 — One-time prerequisites (~2 min)

```bash
node -v                      # ≥ 24
corepack pnpm -v             # 11.x
supabase projects list       # shows the linked "sodium" project
corepack pnpm install
corepack pnpm --filter @sodium/runtime build            # prints "dist/agent.js: ~15 KiB"
corepack pnpm --filter fixture-shop exec playwright install chromium
```

Environment files must exist (already configured in this checkout; see
`.env.example` to recreate): `.env` (root, DB URL), `apps/web/.env.local`,
`apps/worker/.env`.

Seeded accounts, password `password123`:

| Account | Role | Use it to test |
| --- | --- | --- |
| `alice@acme.test` | Acme **owner** | the full happy path |
| `carol@acme.test` | Acme **member** | permission gates |
| `bob@globex.test` | Globex owner | cross-tenant isolation |

---

## Part 1 — Automated baseline (~5 min)

Run these before any visual testing; everything must be green.

| # | Command | Expect |
| --- | --- | --- |
| 1 | `corepack pnpm lint` | 6/6 tasks pass |
| 2 | `corepack pnpm check-types` | 6/6 tasks pass |
| 3 | `corepack pnpm test` | 107 tests: contracts 28, analyzer 13, runtime 33, worker 27, web 6 |
| 4 | `corepack pnpm db:test` | 9 RLS/security tests vs the live DB (rolled-back transactions) |
| 5 | `corepack pnpm build` | web + fixture + runtime build |
| 6 | `corepack pnpm --filter fixture-shop test:e2e` | 7/7 — WebMCP register/execute + fail-closed security |
| 7 | `corepack pnpm --filter @sodium/web test:e2e` | 3/3 — full dashboard flow (spawns the worker itself; ~3 min) |

What each layer proves: (3) extractors, contract validation, risk floors,
signing, loader verification, PR generator, sync comparator; (4) tenant
isolation, member vs owner, immutability triggers, RPC authorization, atomic
publish/rollback; (6) an approved tool is registered **and executed** in a
browser through the real signed manifest and loader; (7) analyze → review →
edit → approve → publish → rollback → PR in a real browser.

---

## Part 2 — Start the stack (3 terminals)

```bash
# Terminal 1 — dashboard on :3000
corepack pnpm --filter @sodium/web dev

# Terminal 2 — fixture shop on :4000 (also the crawl target)
corepack pnpm --filter fixture-shop dev

# Terminal 3 — the worker (keep visible: you'll watch jobs execute here)
corepack pnpm --filter @sodium/worker dev
```

Worker startup line shows `"github":false,"ai":false` — fixture providers
active (deterministic synthesis, local PR output). That is the expected local
mode.

---

## Part 3 — Visual: auth & onboarding

1. Open `http://localhost:3000` → redirected to **/login**.
2. Try a wrong password → inline error next to the form.
3. Sign in as `alice@acme.test` → lands on the dashboard, header shows the
   org and your email.
4. Visit **/onboarding**: step 1 shows you're an owner of Acme; step 2
   explains GitHub App repository access is separate from sign-in and, since
   no GitHub App is configured, offers **“Use the local fixture repository”**;
   step 3–4 explain repository + preview configuration.
5. Sign out (header) → back to /login.

---

## Part 4 — Visual: project overview & the analysis pipeline

1. As alice, open **local-fixture/fixture-shop** from the dashboard.
2. Overview shows four areas: *Run analysis*, *Preview environment* (seeded:
   `http://localhost:4000`, auth `none`), *Analysis runs* (history), and
   *Compatibility findings*.
3. In *Run analysis*: leave SHA blank (fixture), keep the preview environment
   selected (this enables the Playwright crawl stage), click **Analyze
   repository** → you land on the run page.
4. Watch the pipeline **live** (no reloads needed — Realtime broadcast):
   - `Snapshot repository` → succeeded (“30 files”)
   - `Static analysis` → succeeded (“9 routes, 2 forms, 5 actions, 2 handlers”)
   - `Preview exploration` → succeeded (“crawled 5/5 pages”) — watch Terminal 3
     spawn Chromium and hit :4000
   - `Tool synthesis` → succeeded (“proposed ~11 candidate tools”)
   - `Validation & evals` → succeeded (“9 ready, 2 need review”)
   Total ≈ 45–75 s. If the live badge stays on “Connecting…”, reload — the
   run state is in the database either way.
5. Failure state (optional): stop the fixture app, run an analysis **with**
   the preview selected → the crawl stage retries then the run fails with a
   structured `preview_unreachable` error rendered on the run page. Restart
   the fixture afterwards.

---

## Part 5 — Visual: the review table & tool detail

On the finished run page:

1. **Table columns**: purpose (title + snake_case name + description), effect
   (risk badge + confirmation), handler kind, confidence meter, verification
   (evals), status.
2. **Risk filter** → `Destructive`: only **Cancel order** remains (bridge
   handler, confirm: required). `Read-only`: the `read_*` / `open_*` tools.
3. **Status filter** → `needs review`: the low-confidence noise tools
   (`sign_out`, `submit_sign_in`) — exactly the ones a reviewer should reject.
4. Open **Cancel order** (tool detail panel):
   - editable contract fields (title, description, confirmation), input
     schema JSON, handler binding (`bridge: actions.cancel_order`), routes,
     detected authentication, confidence;
   - **Source evidence**: expand the disclosure — the actual
     `app/actions.ts` excerpt with line numbers and hash-backed spans;
   - **Validation & evaluations**: 3 deterministic evals passing.
5. **Floor enforcement (must fail)**: set confirmation to `none`, Save →
   inline error: confirmation cannot go below `required` for destructive
   actions. Deterministic code, not the model, owns this rule.
6. **Edit**: improve the description, Save → “Saved. Re-validated and marked
   needs review.” Status chip flips to *needs review*.
7. **Approve** Cancel order → status *approved* (this mints an immutable
   contract version; nothing is live yet).
8. **Reject**: open `Sign out`, add a note (“noise”), Reject → back in the
   table it renders struck-through as *rejected*.
9. Approve three more for later steps: **Read products**, **Open Products**,
   **Add to cart**.

---

## Part 6 — Visual: permissions & tenant isolation

1. Sign out → sign in `carol@acme.test` (member):
   - She **can** see the repo, runs, candidates, evidence (read access).
   - Open any reviewable candidate → **Approve** → inline error “requires
     owner or admin role”.
   - Publish screen → Publish → the dialog shows the server-side refusal.
2. Sign out → sign in `bob@globex.test`:
   - Dashboard shows only **Globex**; no Acme repository anywhere.
   - Paste alice's repo URL directly → 404. RLS, not UI hiding.
3. Sign back in as alice.

---

## Part 7 — Visual: publish, manifest, telemetry, rollback, PR

Open the repo → **Publish & loader**.

1. **Loader installation** card: the one-line snippet with this site's
   `site_…` id + copy button; manifest endpoint URL shown beneath.
2. **Allowed origins**: `http://localhost:4000` present. Try adding
   `https://example.com/path` → inline error (must be a bare origin).
3. **Approved tools (4)** lists your approvals. Click **Publish manifest** →
   an explicit confirmation dialog (what will be published, for which
   origins) → **Sign & publish** → the versions table shows `v1 (live)`.
4. **Manifest endpoint**: open `http://localhost:3000/api/m/<site_id>` in a
   tab → the signed envelope (`algorithm: "Ed25519"`, `keyId`, `payload`,
   `signature`). Decode it in the console if curious:
   `JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')))`.
   Loader endpoint: `http://localhost:3000/agent/v1.js` serves the bundle.
5. **Telemetry / environment health** (simulate a loader beacon):
   ```bash
   SITE_ID=<site_… from the publish screen>
   curl -si -X POST http://localhost:3000/api/events \
     -H 'content-type: application/json' \
     -d "{\"siteId\":\"$SITE_ID\",\"loader\":\"1.0.0\",\"event\":\"loader_ready\",\"data\":{\"tools\":4,\"registered\":2,\"manifestVersion\":1},\"ts\":0}"
   ```
   → `202`; refresh the publish page → *Environment health* shows “Loader
   last ready …”. (Send a malformed body → `400`, nothing stored.)
6. **Version history + rollback**: approve one more candidate, **Publish new
   version** → `v2 (live)`. On the `v1` row click **Roll back to this** →
   confirmation dialog → `v3 (live)` now carries v1's content; open
   *Deployment history* → `publish, publish, rollback`.
7. **Integration PR**: click **Generate integration PR** → “PR generation
   queued.” → watch Terminal 3 process it → reload: status `open` with a
   `file://` path (local mode). Inspect the reviewable file set:
   ```bash
   ls /tmp/sodium-worker/local-prs/*/ /tmp/sodium-worker/local-prs/*/sodium/
   cat /tmp/sodium-worker/local-prs/*/PR_DESCRIPTION.md
   node /tmp/sodium-worker/local-prs/*/sodium/verify.mjs   # "ok: N bridge handlers present"
   ```
   Check `sodium/bridge.ts` imports **your own** `cancelOrder`/`addToCart`
   from `app/actions`, and `app/layout.tsx` gained exactly the two-line
   `<SodiumAgent />` edit.

---

## Part 8 — Visual: the WebMCP runtime on the fixture shop

The fixture (`http://localhost:4000`) is self-contained: it serves the real
loader at `/agent.js` and a dev-key-signed manifest at `/fixture-manifest`.

**Option A — any browser, DevTools console (recommended).** On a fixture
page, paste the polyfill (mirrors the current `document.modelContext` draft;
same as `examples/fixture-shop/e2e/polyfill.ts`):

```js
(() => {
  const tools = new Map();
  document.modelContext = {
    async registerTool(tool, options) {
      if (tools.has(tool.name)) throw new Error("duplicate: " + tool.name);
      tools.set(tool.name, tool);
      options?.signal?.addEventListener("abort", () => tools.delete(tool.name));
    },
  };
  window.wmcp = {
    names: () => [...tools.keys()].sort(),
    run: async (name, input) => await tools.get(name).execute(input ?? {}, {}),
  };
})();
```

then inject the loader (the page's own loader ran before your polyfill
existed, so it no-opped — exactly the fail-harmless behavior):

```js
const s = document.createElement("script");
s.src = "/agent.js";
s.dataset.site = "site_fixtureshop01";
s.dataset.manifest = location.origin + "/fixture-manifest";
s.dataset.telemetry = "off";
s.dataset.debug = "true";
document.head.appendChild(s);
```

Wait a beat, then walk through every tool class (re-paste both snippets after
any full navigation — tools are per-document by spec):

| Where | Console | Watch for |
| --- | --- | --- |
| `/products` | `wmcp.names()` | `["add_to_cart","open_product","read_products"]` — and **not** the contact/orders tools (route gating) |
| `/products` | `await wmcp.run("read_products")` | `{ ok:true, data:{ names:["Widget","Gadget","Doohickey"], prices…, cart_size… } }` |
| `/products` | `await wmcp.run("add_to_cart",{productId:"widget",quantity:2})` | `{ ok:true, result:{ added:2, cartSize:2 } }` → **reload** → the page's cart counter visibly reads 2 |
| `/products` | `await wmcp.run("add_to_cart",{productId:"widget",quantity:99})` | `{ ok:false, error:"invalid_input" }` — schema gate before any handler runs |
| `/products` | `await wmcp.run("open_product",{id:"gadget"})` | the browser **navigates** to /products/gadget |
| `/contact` | `await wmcp.run("submit_contact",{name:"Ada",email:"ada@example.com",topic:"sales",message:"Ten widgets please."})` | fields **visibly fill**, the form submits through the app's own Server Action, page lands on `?sent=1` with the banner |
| `/orders` (signed out) | — | redirects to /login: the app's auth, untouched |
| `/orders` (sign in first) | `wmcp.names()` | includes `cancel_order` (route + `[data-signed-in]` state condition) |
| `/orders` | `await wmcp.run("cancel_order",{orderId:"ord_1001",confirm:false})` | `{ ok:false … }` — the **backend** refuses unconfirmed cancellation |
| `/orders` | `await wmcp.run("cancel_order",{orderId:"ord_1001",confirm:true})` then reload | order row visibly shows **canceled** |

**Security fail-closed (visual):** repeat the two snippets on a fresh
`/products` load but set

- `s.dataset.manifest = location.origin + "/fixture-manifest?tamper=1"` →
  console warns `[sodium] manifest rejected: bad_signature`, `wmcp.names()`
  is `[]`;
- `…"/fixture-manifest?origin=https://evil.example"` → warns about the
  origin mismatch, zero tools registered.

Reset the shop's demo data anytime: `curl -X POST http://localhost:4000/api/reset`.

**Option B — real WebMCP browser.** In Chrome 149+ enable
`chrome://flags/#enable-webmcp-testing` (or “Experimental Web Platform
features”), optionally install the *Model Context Tool Inspector* extension
(GoogleChromeLabs/webmcp-tools), and browse `http://localhost:4000` — the
loader feature-detects the real `document.modelContext` and registers the
same tools with no polyfill.

**Option C — watch the automated suite drive a visible browser:**
`corepack pnpm --filter fixture-shop exec playwright test --headed`
(or `--ui` for the interactive runner).

---

## Part 9 — Visual: continuous sync (drift → findings → draft)

Requires a published manifest (Part 7). Simulate a push that breaks a
published tool:

1. Edit `examples/fixture-shop/app/actions.ts`: rename
   `export async function cancelOrder` → `cancelOrderRenamed`.
2. Enqueue a sync job (stand-in for a verified push webhook; run from repo
   root):
   ```bash
   node --input-type=module - <<'EOF'
   import postgres from "postgres";
   import { readFileSync } from "node:fs";
   for (const line of readFileSync(".env", "utf8").split("\n")) {
     const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
     if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
   }
   const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1 });
   const message = {
     type: "sync.compare",
     repositoryId: "dddddddd-0000-0000-0000-000000000001",
     commitSha: "b".repeat(40),
     deliveryId: "manual-" + Date.now(),
     attempt: 0,
   };
   await sql`select pgmq.send('sodium_jobs', ${sql.json(message)}::jsonb, 0::integer)`;
   console.log("sync job enqueued");
   await sql.end();
   EOF
   ```
3. Terminal 3 logs `sync: breaking findings; draft manifest created`.
4. Repo overview → **Compatibility findings**: a `breaking` /
   `handler_removed` finding for `cancel_order`.
5. Publish screen → versions table: a new row marked **draft from sync —
   publish to adopt**. The live manifest did **not** change — drafts always
   require a human publish.
6. Revert the rename in `app/actions.ts`.

---

## Part 10 — Visual: webhook verification (optional)

1. Add `GITHUB_WEBHOOK_SECRET=devsecret` to `apps/web/.env.local`, restart
   the web dev server.
2. Unsigned delivery is refused:
   `curl -si -X POST http://localhost:3000/api/webhooks/github -d '{}'` → `401`.
3. A correctly signed delivery is accepted and deduplicated:
   ```bash
   BODY='{"zen":"design for failure"}'
   SIG=$(node -e "const c=require('node:crypto');process.stdout.write('sha256='+c.createHmac('sha256','devsecret').update(process.argv[1]).digest('hex'))" "$BODY")
   curl -si -X POST http://localhost:3000/api/webhooks/github \
     -H "x-hub-signature-256: $SIG" -H "x-github-event: ping" \
     -H "x-github-delivery: manual-1" -H 'content-type: application/json' -d "$BODY"
   # → 200 {"ok":true,"ignored":"ping"} ; repeat the same command →
   # {"ok":true,"duplicate":true}  (delivery-id idempotency)
   ```
4. Remove the temporary secret afterwards.

---

## Expected-results summary

| Area | Pass looks like |
| --- | --- |
| Automated baseline | 107 unit + 9 DB + 7 fixture e2e + 3 dashboard e2e, lint/types/build green |
| Pipeline | 5 stages stream live; ~11 candidates; structured errors on unreachable preview |
| Review | filters work; evidence one click away; floors block unsafe edits; edit → needs review; approve/reject stick |
| Permissions | member reads but cannot approve/publish; other tenant sees nothing |
| Publication | signed envelope at `/api/m/{siteId}`; versions immutable; rollback = new version with old content; deployment history complete |
| Integration PR | worker emits `@generated` bridge + 2-line layout edit + verify script; never the default branch |
| Runtime | tools register per route/state; every handler class executes visibly; invalid input, tampered signatures, and wrong origins all register nothing |
| Sync | drift → breaking finding + draft; production manifest untouched |
