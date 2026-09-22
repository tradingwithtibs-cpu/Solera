# Solera port — platform notes

Status: design document, Sept 22 2026. No source file has been modified. This is the list of platform facts that will bite the implementers of `docs/port/{design-system,layout-engine,pages,backend}.md`, checked against what is actually installed on the `redesign` branch (commit `753761e`): Next.js **16.3.5**, React **19.2.8**, Tailwind **4.3.3** (`@tailwindcss/postcss` 4.3.3, no `tailwind.config`), TypeScript **5.9.3**, ESLint **9.39.5** with `eslint-config-next` 16.3.5 and `eslint-plugin-react-hooks` **7.1.1**, `@supabase/supabase-js` **2.116.0**, Node **v22.14.0** / npm 10.9.2 at `/Users/tibet/.local/node/bin`. Every claim below says where it was read or how it was run; anything not verified is marked as such.

Companions: `backend.md` §12 (env names), §13.1 (test harness shim), §8.1 (Vercel/Supabase cron constraints), `design-system.md` §5.1 (the `@theme` remap), `layout-engine.md` §1.3 (layout storage keys), `pages.md` (per-route storage keys).

---

## 0. Running everything (the gate)

The user's Node is not on the default `PATH`. Every command starts with:

```sh
export PATH=/Users/tibet/.local/node/bin:$PATH
cd /Users/tibet/code/stocklana
```

| Command | What it runs (`package.json` `scripts`) | Measured on this branch (Sept 22) |
| --- | --- | --- |
| `npm run typecheck` | `tsc --noEmit` | 7.6 s, clean |
| `npm run lint` | `eslint` (flat config, `eslint.config.mjs`; lints `**/*.{js,jsx,mjs,ts,tsx,mts,cts}` including `tests/`) | 23 s, zero warnings |
| `npm test` | `node --test tests/*.test.mjs` | 9 s, 34 tests pass |
| `npm run build` | `next build` (Turbopack) | 30 s, 21 static pages, exit 0 |
| `npm run dev` | `next dev` on :3000 (already running; returned 200 during the build) | — |

The gate from the audit decisions is `npm run typecheck && npm run lint && npm test`; add `npm run build` before every deploy because two things only fail at build time (§1.6 `useSearchParams` without `Suspense`, §1.9 lint no longer runs inside `next build`).

Facts about the toolchain that matter:

- **`next build` and `next dev` can run at the same time.** `next dev` writes to `.next/dev`, `next build` to `.next` (upgrade guide `01-app/02-guides/upgrading/version-16.md` "Concurrent dev and build"; confirmed: the build above ran while the dev server was serving). A lockfile prevents two `dev` or two `build` instances — a second `npm run build` while one runs will refuse, not queue.
- **`next-env.d.ts` is generated and git-ignored** (`.gitignore:41`; it currently references `.next/dev/types/routes.d.ts`). Never edit it or commit it. `tsconfig.json` includes both `.next/types/**/*.ts` and `.next/dev/types/**/*.ts`, so `npm run typecheck` sees whichever of dev/build ran last. If `tsc` complains about a missing generated type, run `npx next typegen` (`05-config/02-typescript.md` "Route-Aware Type Helpers").
- **`AGENTS.md` is rewritten by `next dev`** (its own header says so; it is committed). Do not "clean it up"; commit it with whatever the dev server left.
- **`next lint` no longer exists and `next build` does not lint** (`05-config/03-eslint.md` version history v16.0.0). The `lint` script calling bare `eslint` is the correct form; the `eslint` key in `next.config.ts` would be rejected.
- **Turbopack is the only bundler in use.** `next.config.ts` has no `webpack` key; adding one makes `next build` fail unless `--webpack` is passed (`version-16.md` "Turbopack by default"). PostCSS (`postcss.config.mjs`) is honored by Turbopack. Do not add a Babel config file: Turbopack switches to Babel for the files it matches and builds slow down (`08-turbopack.md` Babel row).
- **React Compiler is off** (`reactCompiler` absent from `next.config.ts`). Turning it on needs `babel-plugin-react-compiler` and slows builds (`05-config/01-next-config-js/reactCompiler.md`); not this week. The compiler's *lint rules* are on regardless (§3).
- **Vercel builds with the same commands**: `next build` on Node 22 (Next requires ≥ 20.9.0, `node_modules/next/package.json` `engines`). Build limit 45 min, 1 concurrent build, 100 deployments/day on Hobby (`vercel.com/docs/limits`, fetched Sept 22). `next/font/google` downloads Outfit and IBM Plex Mono at build time, so a build with no network falls back to system fonts with a warning instead of failing (dev prints the warning; not re-verified offline).
- **Run one test file** with `node --test tests/portfolio.test.mjs`; `--test-name-pattern` filters within it.
- **Never print `.env.local`.** It is ignored by `.gitignore:34` (`.env*`). `next build` logs `- Environments: .env.local`, which is fine; `cat`, `printenv`, `console.log(process.env)` are not.

---

## 1. Next.js 16.3.5 — do / don't

Docs are under `node_modules/next/dist/docs/01-app/`; paths below are relative to that.

### 1.1 Route handlers (`src/app/api/**/route.ts`)

Do:
- Export `GET`/`POST`/… as `async function` taking `(request: NextRequest, ctx: RouteContext<'/api/plans/[id]'>)` and **`await ctx.params`** — params are a Promise since 15 and sync access is gone in 16 (`01-getting-started/15-route-handlers.md` "Route Context Helper"; `02-guides/upgrading/version-16.md` "Async Request APIs"). `RouteContext`, `PageProps<'/route'>` and `LayoutProps<'/route'>` are global helpers generated by `next dev`/`next build`/`next typegen`; no import.
- Return `Response.json(...)` or `NextResponse.json(...)` (both used today, e.g. `src/app/api/price-history/route.ts:56`).
- Treat every handler as **dynamic and uncached by default** ("Route Handlers are not cached by default", `15-route-handlers.md`). Caching a `GET` needs `export const dynamic = 'force-static'`; nothing in `src/app/api` should do that (every route reads request data or live prices).
- Set `export const maxDuration = <seconds>` on any route that can legitimately run long (the agent route: `backend.md` §12 says 60). Vercel reads it from the build output (`03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`; `vercel.com/docs/functions/configuring-functions/duration` shows exactly this export for the App Router).
- Use `after()` from `next/server` for work that must finish after the response (logging a fill, kicking a backfill); it is kept alive by Vercel's `waitUntil` and bounded by the route's `maxDuration` (`04-functions/after.md` "Duration", "Platform Support"). The current `void backfill()` in `price-history/route.ts:106` is *not* protected this way and can be killed when the function instance freezes; wrap it in `after(() => backfill())`.
- Keep module-level caches (`price-history/route.ts:47-51` `cached`, `single`) but treat them as best-effort: each Vercel function instance has its own copy and instances are recycled. Anything that must survive goes to Supabase or a `Cache-Control: s-maxage` header the CDN can honor.

Don't:
- Don't put a `route.ts` next to a `page.tsx` in the same segment (build error, `15-route-handlers.md` "Route Resolution"). New pages `/agent`, `/discover` etc. keep their APIs under `/api/...`.
- Don't export `runtime = 'edge'`: deprecated, and `node:crypto` (`src/lib/session-server.ts:1`), `readFile` (`opengraph-image.tsx`), `@solana/web3.js` all need Node (`02-route-segment-config/runtime.md`).
- Don't write `'use cache'` inside a handler body; it is only legal in a helper function and only when `cacheComponents: true` (§1.4).
- Don't send or accept bodies over 4.5 MB (Vercel `FUNCTION_PAYLOAD_TOO_LARGE`, `vercel.com/docs/functions/limitations` "Request body size").

### 1.2 `proxy.ts`, not `middleware.ts`

- The file convention is `src/proxy.ts` exporting `export function proxy(request: NextRequest)` plus `export const config = { matcher: [...] }`. `middleware.ts` still works but is deprecated; codemod `npx @next/codemod@canary middleware-to-proxy .` (`03-file-conventions/proxy.md`, `middleware.md`).
- Proxy runs on the **Node runtime only**; a `runtime` export in it throws (`proxy.md` "Runtime").
- Without a `matcher` it runs on every request including `_next/static`, `_next/image` and `public/` (`proxy.md` "Matcher"). Always exclude those.
- `revalidateTag`/`revalidatePath` cannot be called from Proxy (`04-functions/revalidateTag.md` "Usage").
- Server Functions are POSTs to the page's route, so a matcher that skips a path skips their auth too; verify auth inside every handler/function, never only in Proxy (`proxy.md` "Good to know" under execution order).
- **Decision inherited from `backend.md` §2.6: no `proxy.ts` this week.** Auth stays inside route handlers (`requireOwner()`), which is also where the Supabase access token is checked (§7).

### 1.3 Async request APIs (pages, layouts, metadata files)

- `params` and `searchParams` props are Promises in `page.tsx`, `layout.tsx`, `default.tsx`, `opengraph-image.tsx`, `icon.tsx` (`version-16.md` "Async Request APIs", "Async parameters for icon, and open-graph Image"). In a Server Component `await params`; in a Client Component unwrap with React's `use(params)` (`03-file-conventions/dynamic-routes.md`).
- `cookies()`, `headers()`, `draftMode()` are `await`ed.
- Today no page reads `params` directly: `TradeScreen.tsx:6` uses `useParams()`/`useSearchParams()` from `next/navigation` inside a Client Component, which stays valid. New desktop routes (`/asset/[ticker]` rendering the markets grid, `layout-engine.md` §5.2) should read `params` in the server `page.tsx` and pass the string down.

### 1.4 Caching model (the "previous model"; Cache Components stays off)

- `fetch()` is **not cached by default** (`04-functions/fetch.md` `options.cache` "auto no cache"). Opt in per call with `{ cache: 'force-cache' }` or `{ next: { revalidate: 900, tags: ['prices'] } }`. `{ revalidate: 3600, cache: 'no-store' }` together is an error. The existing `cache: "no-store"` on CoinGecko/Jupiter fetches is therefore redundant but harmless.
- In route handlers `fetch` memoization does not apply (`fetch.md` "Memoization" good-to-know) — two identical fetches in one handler are two requests.
- `unstable_cache(fn, keys, { revalidate, tags })` from `next/cache` is the way to cache a non-`fetch` computation (`02-guides/caching-without-cache-components.md`). It is the right tool for the catalog and for a per-range price series.
- `revalidateTag(tag, 'max')` — the second argument is **required** in 16 (`version-16.md` "revalidateTag"; `04-functions/revalidateTag.md`). `updateTag` exists for read-your-writes in Server Actions.
- Route segment config `export const revalidate = 900` must be a literal number, not `15 * 60` ("The revalidate value needs to be statically analyzable", `caching-without-cache-components.md`).
- **Do not enable `cacheComponents: true` this week.** It removes `dynamic`/`revalidate`/`fetchCache` segment configs, changes `GET` route handlers to prerender by default, and switches client navigation to React `<Activity>` (hidden routes keep state, effects re-run on show) — a behaviour change the drag/resize grid and the wallet modal have not been designed for (`05-config/01-next-config-js/cacheComponents.md` "Navigation with Activity"; `02-route-segment-config/index.md` version history). The `instant` segment config and "instant navigation" validation only exist under `cacheComponents` (`02-route-segment-config/instant.md`); ignore both.
- In dev the HMR cache hides fresh data between edits even for `no-store` fetches; a full reload clears it (`fetch.md` "Troubleshooting").

### 1.5 Metadata files and the share image

- `src/app/opengraph-image.tsx` is a special route handler, **static by default** and prerendered at build (`03-file-conventions/01-metadata/opengraph-image.md` "Good to know"; build output lists `○ /opengraph-image`). It reads `public/brand/solera-mark.png` (528 KB) with `readFile` per call; switch to `solera-mark-256.png` (53 KB) or read once at module scope as the doc example does. `ImageResponse` constraints: only flexbox (no `display: grid`), fonts `ttf`/`otf`/`woff` only, 500 KB bundle ceiling for anything imported into the module (`04-functions/image-response.md` "Behavior"). Fonts passed via `fonts: [{ name, data, weight, style }]`; `fontFamily: "sans-serif"` (current) renders with Satori's fallback.
- `icon.png` / `apple-icon.png` in `src/app` already produce the `<link rel=icon>` tags (`01-metadata/app-icons.md`). A dark PWA manifest is optional: `src/app/manifest.ts` returning `MetadataRoute.Manifest` with `theme_color: "#0b0d16"`, `background_color: "#0b0d16"` (`01-metadata/manifest.md`).

### 1.6 Client vs server boundary

- `"use client"` marks a module-graph boundary; everything it imports ships to the browser, but Server Components passed as `children` do not (`01-getting-started/05-server-and-client-components.md` "Using Client Components"). 64 files under `src/` already carry it. Keep `page.tsx` files as Server Components and push `"use client"` down to the interactive leaf (`Panel`, `TradeTicket`, `PanelGrid`).
- `localStorage`, `window`, `matchMedia`, `navigator` exist only in Client Components (`05-server-and-client-components.md:26`). The sanctioned read pattern is `useSyncExternalStore` with a server snapshot plus a one-time post-mount nudge (`src/hooks/use-watchlist.ts:17-38,63-65`); §3 explains why the naive `useEffect(() => setState(read()))` is now a lint error.
- Props crossing the boundary must be serializable: no functions, class instances, `Map`/`Set`, `Date` (`05-server-and-client-components.md` "Passing data").
- `dynamic(() => import(...), { ssr: false })` is allowed **only inside a Client Component**; in a Server Component it errors (`02-guides/lazy-loading.md:66,94-95`). Wallet-adapter UI is already behind the client `SolanaProvider`.
- `useSearchParams()` in a Client Component rendered on a **statically prerendered** page must sit under a `<Suspense>` boundary or `next build` fails with "Missing Suspense boundary with useSearchParams"; dev does not catch it (`04-functions/use-search-params.md` "Prerendering"). `/buy/[ticker]/page.tsx:6` and `/options/[ticker]/[contractId]/page.tsx:6` already wrap `TradeScreen`. If the `?sym=` mirror of `solera:selected-ticker` (`pages.md` §3.2) is read with `useSearchParams` on `/markets` (currently `○` static), wrap that reader in `Suspense`. Prefer `connection()` from `next/server` over `export const dynamic = 'force-dynamic'` when a page must be dynamic.
- `error.tsx` must be a Client Component and receives `{ error, reset }`; the current `src/app/error.tsx:3` destructures `retry`, which is not a prop Next passes (`03-file-conventions/error.md`). Rename to `reset` during the port.
- Providers go as deep as possible; `SolanaProvider` wrapping everything in `layout.tsx` is acceptable but any new provider (`LayoutStore`, `CommandPalette`) wraps `{children}` inside `AppShell`, not `<html>`.
- `server-only` / `client-only` imports are understood by Next without installing the packages (`05-server-and-client-components.md` "Preventing environment poisoning"). Put `import "server-only"` at the top of `src/lib/supabase.ts`'s service half if it is split, and of every `src/lib/*-server.ts`.
- `Buffer` is used in client code (`use-session.ts:87`, `ProfileSheet.tsx`, `DeepLinkResumer.tsx`) and works only because `@solana/web3.js` installs a global polyfill; new client code should use `Uint8Array` + `btoa`/`TextDecoder` and not depend on it.

### 1.7 Fonts and images

- `next/font/google` with non-variable families needs explicit `weight` arrays, as `layout.tsx:12-22` does (`02-components/font.md` "weight"). `display` defaults to `swap`, `preload` to `true`. The variables `--font-display`/`--font-figures` are set by the class on `<html>`; Tailwind maps them through `@theme inline` (§4). **Do not port the partner's `assets/fonts.css`** (766 KB of base64, and the 400-weight `local(Arial)` faces that caused its sans body bug, `design-system.md` §0).
- `next/image` (`src/components/Logo.tsx`) in 16: `images.qualities` defaults to `[75]` and any other `quality` prop is coerced; `minimumCacheTTL` defaults to 14400 s; `imageSizes` no longer includes 16; `maximumRedirects` 3; local `src` with a query string needs `images.localPatterns[].search`; local-IP sources are blocked (`version-16.md` "next/image changes"; `02-components/image.md` "Configuration Options"). Remote avatars (none today) need `images.remotePatterns`. Small icons and SVGs: `unoptimized` (`image.md` "unoptimized").
- Hobby image optimization: **5,000 transformations, 300,000 cache reads, 100,000 cache writes per month**; past the limit new sizes return 402 and `alt` text shows (`vercel.com/docs/image-optimization/limits-and-pricing`, fetched Sept 22). Every distinct width × quality × source is one transformation; keep `sizes`/`width` props stable and prefer plain `<img>` for the 24 ticker avatars if they ever become images.

### 1.8 Environment variables

- Only `NEXT_PUBLIC_*` reach the browser, **inlined at `next build`** — a value changed in Vercel after the build is not seen by client code until the next deploy (`02-guides/environment-variables.md` "Bundling Environment Variables for the Browser"). Dynamic lookups (`process.env[name]`) are never inlined. Server code reads `process.env.X` at runtime.
- Load order: `process.env` → `.env.$(NODE_ENV).local` → `.env.local` (skipped when `NODE_ENV=test`) → `.env.$(NODE_ENV)` → `.env`. `node --test` does not load any `.env` file; tests set what they need explicitly (`tests/session.test.mjs:15` sets `SUPABASE_SERVICE_ROLE_KEY`).
- Names in use (values never printed): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, optional `SOLERA_SESSION_SECRET`, `SOLANA_RPC_URL`; planned per `backend.md` §12: `PLAN_EVALUATOR_SECRET`, `ANTHROPIC_API_KEY`, `SOLERA_AGENT_MODEL`, `SOLERA_AGENT_MODEL_ID`. Vercel caps all env vars at 64 KB total per deployment (`vercel.com/docs/limits` "Environment variables").
- `serverRuntimeConfig`/`publicRuntimeConfig` are removed (`version-16.md` "Runtime Configuration"); never reintroduce `next/config`.

### 1.9 Smaller Next 16 changes that can still bite

- **Scroll**: Next 16 no longer forces instant scroll-to-top during navigation when `html { scroll-behavior: smooth }` is set; add `data-scroll-behavior="smooth"` on `<html>` only if smooth scrolling is introduced (`version-16.md` "Scroll Behavior Override"). The design-system skeleton does not set `scroll-behavior`; keep it that way.
- **Parallel routes** need `default.tsx` in every slot or the build fails (`version-16.md`). The port does not plan `@slot` routes; if a `@modal` slot is introduced for the ticket sheet, add `default.tsx` returning `null`.
- `unstable_cacheLife`/`unstable_cacheTag` are `cacheLife`/`cacheTag` (only meaningful with Cache Components).
- Browser floor: Chrome/Edge/Firefox 111+, Safari 16.4+ (`version-16.md` "Node.js runtime and browser support") — `color-mix()`, `oklch()`, `inset`, `:has()` and `100dvh` are all safe.
- `typedRoutes: true` is stable and cheap: typed `<Link href>` catches broken routes after the page renames (`05-config/01-next-config-js/typedRoutes.md`). Optional.

---

## 2. React 19.2.8

Verified by `require("react")` on the installed package: `use`, `useEffectEvent`, `Activity`, `useActionState`, `useOptimistic`, `cache`, `forwardRef` all exported; `react-dom` exports `useFormStatus` and `preload`. `@types/react` declares `use<T>(usable: Usable<T>): T` (index.d.ts:1980), `useEffectEvent` (:1798), `Activity` (:2022) and `ref?: Ref<T>` on `RefAttributes` (:301).

Do:
- Pass `ref` as an ordinary prop to function components: `function Panel({ ref, ...props }: { ref?: React.Ref<HTMLElement> })`. No `forwardRef` (none exists in `src/` today; keep it that way — the layout engine's panel refs for drag/resize are plain props).
- Unwrap promises with `use(promise)` inside `Suspense` (params in Client Components, `pages.md` server-fetched data handed to a client card).
- Forms: `<form action={serverOrClientFn}>` with `useActionState(fn, initial)` for pending/error state and `useFormStatus()` inside the submit button. This is the shape for the auth sheet (`pages.md` §1.7) and the thesis fields; the trade ticket keeps its imperative `useExecuteTrade` because signing is not a form submission.
- `useOptimistic` for feed votes (`backend.md` §10): apply the vote locally, reconcile with the `POST /api/feed/vote` result.
- `useEffectEvent(fn)` for the "latest callback inside a subscription/interval" case (chat polling, layout `pointermove` handlers). It replaces the `useRef`-mirror trick and satisfies `react-hooks/exhaustive-deps`.
- `useId()` for every generated DOM id (panel `aria-labelledby`, form field ids) instead of counters or `Math.random()` (§3 purity).

Don't:
- Don't call Server Actions this week for anything touching Supabase writes; `backend.md` keeps all writes in route handlers so the same code is testable under `node:test`. Client-side `action={async (formData) => fetch("/api/...")}` is fine and still gets `useActionState` semantics.
- Don't rely on `<Activity>` (the router only uses it under `cacheComponents`); mounting/unmounting semantics are the classic ones.

---

## 3. `eslint-plugin-react-hooks` 7.1.1 — the rules that failed earlier, and the fixes

`eslint-config-next/dist/index.js:168` spreads `reactHooks.configs.recommended.rules`, which in 7.1.1 is (read from the plugin's `configs` object):

| Rule | Level | What it flags (plugin `description`) | Fix pattern for this codebase |
| --- | --- | --- | --- |
| `react-hooks/set-state-in-effect` | error | "calling setState synchronously in an effect" | Read external/browser state through `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` (`use-watchlist.ts:17-38`, `use-trade-mode.ts:40-51`, `use-session.ts:53-61`). The hydration "nudge" effect only calls listeners, never `setState` (`use-watchlist.ts:63-65`). If a value must be derived from props, compute it during render. If a fetch result must land in state, `setState` inside the `.then`/`await` continuation is allowed (it is asynchronous), as `use-chat.ts` does. |
| `react-hooks/refs` | error | "reading/writing during render" (`ref.current` outside effects/handlers) | Touch `ref.current` only in event handlers, effects, or `useEffectEvent` callbacks. For drag state that must not re-render (`layout-engine.md` §2), keep it in a ref and read it inside `pointermove`; the value shown to the user is state. Lazy init `if (ref.current === null) ref.current = expensive()` is the one render-time write React documents as allowed; keep the guard exactly that shape. |
| `react-hooks/purity` | error | "do not call known-impure functions" during render (`Date.now()`, `Math.random()`, `crypto.randomUUID()`, `performance.now()`) | Ids: `useId()`. Timestamps: compute in the handler that creates the record (`use-portfolio.ts:200-206` already does this inside `persist` callers) or in the server route. "Now" for relative times ("checked 12 s ago"): a `useNow(intervalMs)` hook built on `useSyncExternalStore` over a module-level ticking store, never `Date.now()` in the component body. Sparkline noise/jitter: none — no invented numbers anyway. |
| `react-hooks/set-state-in-render` | error | `setState` during render | Derive; or key the component to reset it. |
| `react-hooks/immutability` | error | mutating props/state/hook results | Spread/`structuredClone`; the layout reducer returns new arrays (`layout-engine.md` §1.4 pure functions). |
| `react-hooks/globals` | error | assigning module/global variables during render | Module-level stores (`snapshot`, `listeners`) are written only from handlers/`persist` functions, never from the component body — the existing hooks are the template. |
| `react-hooks/static-components` | error | components defined inside render | Define `PanelBody` components at module scope; registry entries are references, not inline arrow components (`layout-engine.md` §1.2). |
| `react-hooks/error-boundaries` | error | `try/catch` around child rendering | Use `error.tsx` / an `ErrorBoundary` class. |
| `react-hooks/use-memo`, `preserve-manual-memoization` | error | `useMemo` callback not returning / memo invalidated by later mutation | Return from `useMemo`; do not mutate memoized objects. |
| `react-hooks/exhaustive-deps` | warn | missing deps | `useEffectEvent` for latest-value callbacks; otherwise list deps. Warnings do not fail `eslint`, but the branch is at zero and should stay there. |
| `react-hooks/incompatible-library`, `unsupported-syntax` | warn | libraries the compiler cannot analyze | Only matters if `reactCompiler` is enabled; it is not. |
| `react-hooks/rules-of-hooks` | error | conditional hooks | as always |

Two more from `eslint-config-next/typescript`: `@typescript-eslint/no-unused-vars` and `no-unused-expressions` are **warn**. `eslint-config-next/core-web-vitals` upgrades only `@next/next/no-html-link-for-pages` and `@next/next/no-sync-scripts` to errors (read from `@next/eslint-plugin-next`'s `configs["core-web-vitals"]`); `@next/next/no-img-element` stays a **warning**, so a plain `<img>` for ticker avatars or the OG image passes the gate but adds a warning — either use `next/image` or add `// eslint-disable-next-line @next/next/no-img-element` with a reason so the branch stays at zero warnings.

---

## 4. Tailwind 4.3.3 — theming for a dark-only app

Verified with the installed compiler (`node_modules/tailwindcss/dist/lib.mjs` `compile()`), not from memory:

- `@import "tailwindcss"` emits `@layer theme, base, components, utilities;` and the default theme (`node_modules/tailwindcss/theme.css`, e.g. `--color-neutral-400: oklch(70.8% 0 none)` at line 254). **Unlayered CSS always beats layered utilities**, whatever the source order: the probe confirmed `.text-neutral-400 { color: red }` written after the import wins over `.text-neutral-400 { color: var(--color-neutral-400) }`. That is exactly why `globals.css:238-243` (`.text-neutral-400 { color: #756e93 }`, `.text-neutral-900`) must be **deleted** in the port; otherwise 149 call sites stay light-theme no matter what `@theme` says (`design-system.md` §0, §5.1).
- `@theme { --color-neutral-400: #8a8fb3; }` in `globals.css` overrides the default and the utility becomes `.text-neutral-400 { color: var(--color-neutral-400) }` — so remapping the palette in `@theme` flips every existing `neutral-*`/`violet-*`/`emerald-*` class with zero component edits (`design-system.md` §5.1 table). Opacity modifiers follow the remap but keep their light meaning: `bg-neutral-900/40` compiles to `color-mix(in oklab, var(--color-neutral-900) 40%, transparent)`, i.e. a 40 % wash of the *new* near-white value; every `/nn` needs a hand edit.
- `@theme` vs `@theme inline`: plain `@theme` emits the variable on `:root` and utilities reference `var(--name)` (runtime-overridable, correct for colours, radii, shadows). `@theme inline` inlines the value into the utility: `.font-sans { font-family: var(--font-display) }`. Keep the font mapping `inline` as today (`globals.css:25-30`) because `--font-display` is defined by `next/font`'s class on `<html>`; put colours in a non-inline `@theme`.
- `@utility glass { … }` defines a utility that composes with variants (`hover:glass`, `md:glass` compiled correctly in the probe); `color-mix()` inside it gets an automatic `@supports (color: color-mix(in lab, red, red))` fallback. Use `@utility` for `glass`, `panel`, `tape-mask`; use plain classes only for multi-rule components that never need variants.
- `@custom-variant phone (@media (max-width: 767px));` compiles to a working `phone:hidden`. The app's own breakpoints (767/1100/1200 px in `globals.css`) can be expressed this way instead of duplicating media queries; Tailwind's own `md:` is 48 rem = 768 px, which matches the existing `max-width: 767px` split.
- **`dark:` compiles to `@media (prefers-color-scheme: dark)`** (probe output). In a dark-only app never write `dark:` — there is no light state to guard against, and a light-OS visitor would lose the dark styles. If a manual toggle ever returns, redefine it with `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));` in `globals.css`.
- `rounded-full` is `calc(infinity * 1px)`, not a token; `rounded-xl/2xl/3xl` resolve to `--radius-xl/2xl/3xl`, so `design-system.md` §5.1 can zero them in `@theme` (the probe emitted `.rounded-2xl { border-radius: var(--radius-2xl) }`).
- Automatic content detection scans the project, skipping `.gitignore`d paths, so `.next`, `node_modules`, and the partner build at `/Users/tibet/Desktop/solerafinal` (outside the repo) are never scanned. Class names must appear literally in source: `` `text-${tone}-500` `` is not generated. For genuinely dynamic sets, `@source inline("bg-gain text-loss …")` compiles (probe) and is the safelist mechanism.
- New semantic tokens (`--color-panel`, `--color-line`, `--color-gain`, `--radius-panel`, `--shadow-float`, `--ease-solera`, `design-system.md` §5.3) declared in `@theme` become `bg-panel`, `border-line`, `text-gain`, `rounded-panel`, `shadow-float`, `ease-solera` automatically; nothing in `postcss.config.mjs` changes.
- `@solana/wallet-adapter-react-ui/styles.css` is imported globally by `SolanaProvider.tsx:15` and is **not** overridden anywhere in `globals.css` (grep `wallet-adapter`: no matches). Its modal is the library's purple/white; the port must restyle `.wallet-adapter-modal*`, `.wallet-adapter-button*` with unlayered rules (they win over the library's unlayered rules only by order and specificity — put them after the import, i.e. in `globals.css`, which loads first in `layout.tsx`; use a slightly higher specificity such as `body .wallet-adapter-modal-wrapper`).

---

## 5. Dark-only: theme colour, colour scheme, safe areas

`src/app/layout.tsx:44-48` currently exports:

```ts
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };
```

Change it to:

```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",      // enables env(safe-area-inset-*) on iPhone; without it globals.css's calc(8px + env(safe-area-inset-bottom)) evaluates to 8px
  themeColor: "#0b0d16",     // --era-ink; no media array, there is no light theme
  colorScheme: "dark",       // <meta name="color-scheme" content="dark">: native scrollbars, form controls, date pickers render dark
};
```

- `themeColor`, `colorScheme`, `viewportFit` are all fields of `Viewport` (`node_modules/next/dist/lib/metadata/types/metadata-interface.d.ts:157,163`, `extra-types.d.ts:52`; `04-functions/generate-viewport.md`). The export is only valid in Server Components — `layout.tsx` is one.
- Also set `:root { color-scheme: dark; }` in `globals.css` (the design-system skeleton does) so the same holds for iframes and `<select>` popups that read CSS rather than the meta tag; and `body { background: var(--ink-page) }` so overscroll on iOS shows ink, not white.
- The partner build's `index.html:2-3` is the reference: `viewport-fit=cover` and `theme-color #0b0d16`.
- No `dark` class, no `next-themes`, no theme flash script: with a single theme the HTML is dark from the first byte and there is nothing to prevent (`02-guides/preventing-flash-before-hydration.md` is irrelevant).
- Retire the `.pump-glow-pulse` red shadow and any light literal (`#fff`, `#ece7fb`, `#756e93`) still in `globals.css`; `design-system.md` §8 replaces the file wholesale.

---

## 6. Tests: how `node --test` runs TypeScript, and the `esModuleInterop` trap

`tests/*.test.mjs` (`session.test.mjs:6-13` is the canonical copy) register a CommonJS `.ts` loader:

```js
const load = createRequire(import.meta.url);
load.extensions[".ts"] = (module, filename) =>
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
```

Consequences, each verified:

- **`esModuleInterop` must be `true` whenever the module under test default-imports a CommonJS package.** `src/lib/phantom-deeplink.ts:1-2` does `import nacl from "tweetnacl"; import bs58 from "bs58"`. Transpiled without the flag this becomes `const tweetnacl_1 = require("tweetnacl"); tweetnacl_1.default.sign` — and `tweetnacl` (1.0.3, CJS, no `__esModule`, no `.default`) makes that `undefined`. With `esModuleInterop: true` the output is `__importDefault(require("tweetnacl"))`, which wraps it as `{ default: nacl }`. That is why `tests/phantom-deeplink.test.mjs:9` passes `esModuleInterop: true` and the other nine files do not need it. `bs58` 6.0.0 ships a CJS build (`src/cjs/index.cjs`) with `__esModule` and `exports.default`, so the test itself does `load("bs58").default` (`:15`). Rule: any new `src/lib` module importing `tweetnacl`, `bs58`, `canvas-confetti`, or another CJS default export gets tested with a loader that sets `esModuleInterop: true` — simplest is to put it in the shared harness `backend.md` §13.1 proposes (`tests/_harness.mjs`) and use it everywhere. `tsconfig.json` already has `esModuleInterop: true` for the app build, so the app and the tests then agree.
- The loader handles `.ts` only. A `.tsx` component cannot be loaded; keep logic in `.ts` files under `src/lib` and test those. `.json` imports (`@/data/xstocks.json`) work through Node's own JSON loader once the alias is resolved.
- `@/` aliases are **not** resolved by the loader today; every tested file uses relative imports. `backend.md` §13.1 adds a six-line `Module._resolveFilename` shim mapping `@/` → `src/` so route handlers can be loaded; adopt it rather than rewriting imports.
- `node --experimental-strip-types` is **not** a replacement: `import("/…/src/lib/portfolio.ts")` fails with `ERR_MODULE_NOT_FOUND … '/…/src/lib/live-prices'` because ESM needs explicit extensions and the codebase uses extensionless relative imports. The `transpileModule` loader stays.
- Tests run without `.env*`; set process.env before `load()` as `session.test.mjs:15` does. Never paste a real key into a test.
- `next/server` loads under this harness (`backend.md` §16 verified `NextRequest`/`NextResponse` behave), so route handlers are unit-testable by calling `POST(new NextRequest(url, { method, body }))` directly.
- ESLint lints `tests/*.mjs` with the same config; `require`-style access through `createRequire` is fine, top-level `await` is fine (`supportsTopLevelAwait: true` in the parser options, `eslint-config-next/dist/index.js`).

---

## 7. Supabase: what is installed, what is not, and the auth gotchas

- Installed: `@supabase/supabase-js` 2.116.0 (with `auth-js`, `postgrest-js`, `realtime-js`, `storage-js`, `functions-js` under `node_modules/@supabase/`). **`@supabase/ssr` is not installed** (`ls node_modules/@supabase/ssr` → no such directory). Latest is 0.12.7 with peer `@supabase/supabase-js ^2.114.0` (`npm view`, Sept 22); install would be `npm i @supabase/ssr@0.12.7`. Its API, read from the published `dist/main/*.d.ts`: `createBrowserClient(url, key, { cookies?, cookieOptions?, cookieEncoding?, isSingleton? })` and `createServerClient(url, key, { cookies: { getAll(), setAll(cookiesToSet) }, cookieOptions?, cookieEncoding? })`. **`backend.md` §2.6 decides not to use it this week**: the browser signs in with `supabase-js`, hands the access token to `POST /api/session`, and the server verifies it and mints the existing HMAC session token. Keep that decision; `@supabase/ssr` only earns its place if Server Components need to read the user, which no page in `pages.md` does.
- Client calls (`node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts`): `auth.signUp({ email, password, options?: { emailRedirectTo?, data? } })` → `AuthResponse` (`data.session` is `null` while email confirmation is on — the reason the audit defaults confirmation **off**); `auth.signInWithPassword({ email, password })`; `auth.signOut()`; `auth.onAuthStateChange((event, session) => …)`; `auth.getSession()` (client only). Server verification: `auth.getUser(jwt)` (`:1591`, network round-trip) or `auth.getClaims(jwt)` (local JWT check against the project's signing keys, `:1408` note). Use `getClaims` in `/api/session` and fall back to `getUser` if the project still uses symmetric HS256 keys (open question).
- **The existing anon client will not hold an auth session.** `src/lib/supabase.ts:20` creates it with `auth: { persistSession: false }`, which is right for chat reads but means `signInWithPassword` on it forgets the session on reload. Create a second browser client for auth (`getSupabaseBrowserAuth()`), default options, and let it own the session; the default storage key is `` `sb-${projectRef}-auth-token` `` in `localStorage` (`node_modules/@supabase/supabase-js/dist/index.mjs:651`), which is the one non-`solera:`/`stocklana:` key the app will write (§10). `auth.storageKey` can rename it but tooling and docs assume the default; leave it.
- Realtime is already used from the browser (`use-chat.ts:63-68` `channel().on("postgres_changes")`) and needs nothing from Vercel; Free tier allows **200 concurrent connections and 2 M messages/month**. Each open room is one connection; do not subscribe a channel per feed card.
- Free tier (supabase.com/pricing, fetched Sept 22): 500 MB database, 50 000 MAU, 5 GB egress, 1 GB storage, 500 K edge-function invocations, **2 active projects**, and **projects pause after 1 week of inactivity** (a paused project makes every `/api/*` route fail until someone resumes it in the dashboard — a risk for a hackathon demo after a quiet weekend). Auth rate limits (supabase.com/docs/guides/auth/rate-limits): **2 emails per hour with the built-in provider** (sign-up confirmations, resets — cannot be raised without custom SMTP), sign-ups/sign-ins 30 per 5 minutes, token refresh 150 per 5 minutes, OTP one per 60 s per user.
- Service-role key stays server-only (`getSupabaseService`, `src/lib/supabase.ts:25-31`) and every write goes through a route handler that verified the owner (`backend.md` §1 principle 1). Never expose it through `NEXT_PUBLIC_`.

---

## 8. Vercel Hobby limits (all fetched from vercel.com/docs on Sept 22 2026)

| Limit | Hobby value | Source | Implication for the port |
| --- | --- | --- | --- |
| Function max duration, **Fluid compute** (default for projects created after Apr 23 2025; this project is from Sept 2026) | 300 s default and maximum | `/docs/functions/limitations` "Max duration"; `/docs/functions/configuring-functions/duration` | The brief's "10 s / 60 s" is the **legacy** table (`/docs/limits` "Vercel Functions": pre-Apr-2025 projects without Fluid: 10 s default, 60 s max). Confirm in the dashboard (Settings → Functions → Fluid compute). Design routes as if 60 s were the ceiling anyway: `backend.md` sets `maxDuration = 60` on `/api/agent` and an 8 s budget on the evaluator. |
| Memory | 2 GB / 1 vCPU, not configurable | same | fine |
| Request/response body | 4.5 MB | same, "Request body size" | agent transcripts and feed pages must paginate |
| Bundle size | 250 MB uncompressed | same | `@solana/web3.js` + wallet adapters are far below |
| File descriptors | 1 024 per instance | same | Supabase client is a singleton (`supabase.ts`); do not create clients per request |
| Cron jobs | 100 per project, **minimum interval once per day**, precision ±59 min, more frequent expressions **fail deployment** | `/docs/cron-jobs/usage-and-pricing` | No minute-level watcher on Vercel. `backend.md` §8 uses Supabase `pg_cron` + `pg_net` every minute and a single daily Vercel cron (`vercel.json` `{"crons":[{"path":"/api/plans/evaluate?pass=daily","schedule":"0 9 * * *"}]}`). Vercel invokes crons on the production deployment only (from Vercel's cron-jobs guide; not on the page fetched here), so previews rely on the browser fallback. |
| Image optimization | 5 K transformations, 300 K cache reads, 100 K cache writes per month; 402 + `alt` text past the limit | `/docs/image-optimization/limits-and-pricing` | §1.7 |
| Deployments | 100 per day, 1 concurrent build, 45 min build | `/docs/limits` | preview-per-push is fine; do not script deploys in a loop |
| Runtime logs | retained 1 hour | `/docs/limits` "Logs" | debug on the preview while it is fresh; log the evaluator's counts into a Supabase table (`backend.md` §8.3 returns them) rather than relying on Vercel logs |
| Proxied request timeout | 120 s | `/docs/limits` | irrelevant unless `rewrites` to external hosts are added |
| Usage policy | non-commercial personal use | `/docs/image-optimization/limits-and-pricing` "Hobby" | a hackathon demo is fine |

Also: Vercel functions can set `Cache-Control: public, s-maxage=…, stale-while-revalidate=…` and the CDN caches the response (`/docs/functions/limitations` "API support: Cache responses — Yes"). Use it on `GET /api/price-history`, `/api/catalog`, `/api/news` so bursts of viewers do not each hit CoinGecko; the in-memory cache alone is per instance.

---

## 9. CoinGecko for the four chart ranges

`src/app/api/price-history/route.ts` today: `market_chart?vs_currency=usd&days=30` per ticker, downsampled to 120 points, 15-minute in-memory cache, a 12-second-spaced backfill for tickers that hit the rate limit. Measured Sept 22 22:24 UTC against `coins/tesla-xstock/market_chart` (public, keyless):

| `days` | points | spacing | use for |
| --- | --- | --- | --- |
| 1 | 288 | 5 min | 24H |
| 7 | 169 | 60 min | 1W |
| 30 | 720 | 60 min | 1M (today's call) |
| 180 | 181 | 1 day | 6M |

- Granularity is automatic and cannot be requested: `interval=5m` returns error 10005 "exclusive to Enterprise plan customers". So 24H is 5-minute data only because `days=1`; 1W at 5-minute resolution is not available.
- Every response carries `cache-control: max-age=30`; the public tier allows roughly 30 calls a minute (the route comment says "a few dozen"; not re-measured). Four ranges × 8 tickers = 32 calls per full refresh, which trips the limit — the current backfill loop exists because even 8 does.
- Design: extend the route to `?ticker=X&range=24h|1w|1m|6m` mapping to `days = 1|7|30|180`, cache per `(ticker, range)` with `unstable_cache` keyed on both (`revalidate`: 300 s for 24h, 900 s for the rest) **and** a `Cache-Control: s-maxage` header of the same length; fetch a range lazily on first request rather than all four up front; keep the all-ticker `days=30` sweep for sparklines. `AbortSignal.timeout(10_000)` stays under the 300 s function cap either way.

---

## 10. Browser storage keys — the inventory that must survive the port

`sessionStorage` is unused. Every `localStorage` key the live app writes, with owner and shape; renaming any of them wipes returning users' state:

| Key | Owner | Shape |
| --- | --- | --- |
| `stocklana:portfolio` | `src/hooks/use-portfolio.ts:19` | `{ cashBalance, holdings[], transactions[], optionPositions[], optionTransactions[] }`; older blobs without the option arrays still parse (`:120-131`); `null` snapshot means "not hydrated yet" |
| `stocklana:watchlist` | `src/hooks/use-watchlist.ts:6` | `TickerSymbol[]` |
| `stocklana:followed-investors` | `src/hooks/use-followed-investors.ts:5` | `string[]` of investor ids |
| `solera:trade-mode` | `src/hooks/use-trade-mode.ts:7` | `"practice"` or `"live"` (plain string, not JSON) |
| `solera:session` | `src/hooks/use-session.ts:8` | `{ wallet, token, expiresAt }` — the chat/profile bearer token |
| `solera:live-trades` | `src/hooks/use-live-portfolio.ts:14` | `Record<wallet, Transaction[]>` newest first |
| `solera:deeplink-pending` | `src/lib/deferred-signing.ts:53` | `PendingRequest` with the continuation; abandoned after 15 min |
| `solera:deeplink-result` | `src/lib/deferred-signing.ts:54` | `DeepLinkResult` |
| `solera:phantom-deeplink` | `src/lib/phantom-deeplink-adapter.ts:38` | the dapp keypair / shared secret for Phantom on iOS — **sensitive, never log or export** |

Keys the sibling documents introduce (keep the `solera:` prefix and the same `try/catch` discipline): `solera:layout:<page>` and `solera:layout:hint` (`layout-engine.md` §1.3), `solera:selected-ticker`, `solera:chart-range`, `solera:notes` (`pages.md` §1.10, §2.6, §2.3). One inconsistency to settle: `pages.md` §3.9 names the "since you last looked" snapshot `solera:visit` while `layout-engine.md` §5.1 says `solera:last-visit` — pick one (suggest `solera:visit`). Supabase Auth adds `sb-<project-ref>-auth-token` (§7). The practice ledger's move to Supabase (`backend.md` §4) reads `stocklana:portfolio` once on sign-in and must keep writing it for signed-out users.

Partner-build keys are **never read or migrated** (nothing shipped with them and shapes differ): `solera-demo-state-v1`, `solera-demo-visit-v1`, `solera-accounts-v1`, `solera-layout-v1:<page>`, `solera-layout-hint`, `solera-plans-v1` (`assets/engine.js:66,728,945`, `layout.js:10,99`, `plans.js:20`). The `postMessage` types `solera.plan/result/order/cancel/snapshot` are cut with the bridge.

Storage discipline that the lint rules and SSR enforce: read once at module load behind `typeof window !== "undefined"`, expose through `useSyncExternalStore` with a stable server snapshot, nudge listeners once after mount, wrap every `getItem`/`setItem` in `try/catch` (private mode, quota, Safari ITP), and validate parsed shapes before trusting them (`use-portfolio.ts:86-133` is the reference).

---

## 11. Open questions (only the user can answer)

1. Is Fluid compute enabled on the `trysolera` Vercel project (Settings → Functions)? It decides whether the function ceiling is 300 s or 60 s (§8). The design assumes 60 s to be safe.
2. Does the Supabase project use the new asymmetric JWT signing keys? It decides `getClaims(jwt)` (local) versus `getUser(jwt)` (network) in `/api/session` (§7).
3. Confirm email confirmation is off for sign-up (audit default) — with it on, `signUp` returns no session and the 2-emails-per-hour built-in limit makes demos fail (§7).
4. Should the practice portfolio key stay `stocklana:portfolio` forever (recommended) or be migrated to `solera:portfolio` with a one-time copy? Migration adds risk for no visible gain.

## 12. Risks

- A Supabase Free project pauses after a week idle; if the demo project sits untouched before Thursday, every route that needs the database fails until it is resumed by hand (§7).
- The `error.tsx` prop mismatch (`retry` vs `reset`) means "Try again" is currently a no-op; the port should fix it while touching the file (§1.6).
- `useSearchParams` outside `Suspense` on a static page only fails at `next build`, not in dev; the gate must include the build (§0, §1.6).
- `dark:` utilities compile to a media query; any copied Tailwind snippet using them will silently do nothing for light-OS visitors (§4).
- The `.text-neutral-400`/`.text-neutral-900` overrides in `globals.css` defeat the `@theme` remap if left behind (§4).
- Module-level caches and `void backfill()` in route handlers are per-instance and can be frozen mid-flight on Vercel; without `after()` and CDN cache headers, CoinGecko rate limits will show up as empty charts under load (§1.1, §9).
- Vercel Hobby cannot run a cron more than once a day; if the Supabase `pg_cron` path in `backend.md` §8 is not set up, standing plans only evaluate while a browser tab is open (§8).
- `viewportFit: "cover"` is currently missing, so the phone shell's safe-area padding is 0 on iPhone today; adding it changes layout under the tab bar and needs a device check (§5).
- Lint currently passes with zero warnings; the react-hooks 7 rules are errors, and the first drag/resize implementation that reads `ref.current` in render or sets state in an effect will fail the gate — follow §3 from the start rather than retrofitting.
