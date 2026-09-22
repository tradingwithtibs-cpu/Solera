# Solera port — backend design

Status: design document, Sept 22 2026. No source file has been modified. Binding decisions are in `docs/partner-build-audit.md` ("Decisions taken after the audit"): practice mode stays, live mode requires a connected wallet, practice plans execute server-side against a Supabase practice ledger, live plans with a price condition become Jupiter Trigger V2 orders the user signs once, anything Trigger cannot express falls back to notify + one-tap sign, email + password sign-up through Supabase Auth alongside wallet profiles, the agent is a Claude tool-use route built and tested against a mock model, nothing is invented (no people, headlines, trades or numbers), and the in-page `window.SOLERA.agent` / postMessage bridge is cut.

Companions: `docs/port/design-system.md` (tokens, components) and `docs/port/layout-engine.md` (panel grid). This document owns everything behind an `/api/*` route and the SQL under `supabase/`.

Sources read: every file under `src/app/api/*`, `src/lib/{supabase,session,session-server,profiles,verify-signature,chat,ledger,live-ledger,trade,jupiter,tokens,catalog,catalog-server,news,deferred-signing,types}.ts`, `src/hooks/{use-portfolio,use-live-portfolio,use-active-portfolio,use-session,use-trade-mode}.ts`, `supabase/schema.sql`, `supabase/chat.sql`, `tests/*.test.mjs`, `package.json`, `tsconfig.json`, the partner's `assets/plans.js` (grammar at lines 27–71, engine at 79–100), the audit's `plans-agent`, feed and note-on-fill findings, `node_modules/next/dist/docs` (proxy file convention, route segment config), `node_modules/@supabase/auth-js` (`getUser(jwt)`, `getClaims(jwt)`), the `@supabase/ssr@0.12.7` type declarations, and Jupiter's Trigger V2 docs (`/docs/trigger/{authentication,deposit,create-order,manage-orders,lifecycle,order-history,errors,best-practices}.md`). Section 16 lists every external check with its result.

Naming used throughout: an **owner** is the one identity string used by every new table and route (section 2). A **fill** is a completed trade (practice or on-chain). A **plan** is a standing order in plain words with a parsed `condition`. The **evaluator** is the scheduled job that moves plans through their states.

---

## 1. Scope and principles

What is new for Thursday, in the build order of section 14:

| Piece | Where | Depends on |
| --- | --- | --- |
| Identity: `owner`, sessions for email users, profile changes | `src/lib/auth-server.ts`, `src/app/api/{session,profile}/route.ts`, `supabase/port.sql` | Supabase Auth email provider enabled |
| Practice ledger on Supabase, sync-on-sign-in | `src/app/api/practice/*`, `src/hooks/use-portfolio.ts` | identity |
| Fills with a note (practice + live), the public tape | `src/app/api/fills/route.ts`, `types.ts`, `deferred-signing.ts` | identity |
| Plans CRUD + condition schema + describe() | `src/lib/plans.ts`, `src/app/api/plans/*` | ledger, fills |
| `/api/agent` with `MockModel` | `src/lib/agent/*`, `src/app/api/agent/route.ts` | plans, news, prices |
| Evaluator + pg_cron schedule | `src/app/api/plans/evaluate/route.ts`, `supabase/port.sql` (cron block) | plans |
| Live plans through Jupiter Trigger V2, notify fallback, inbox | `src/lib/jupiter-trigger.ts`, `src/app/api/inbox/route.ts` | plans, evaluator |
| Feed: posts, votes, comments | `src/app/api/feed/*` | identity |

Principles that every section obeys:

1. **The server is the gate.** As today (`supabase/schema.sql:26-27`, `src/app/api/chat/route.ts:36-40`), the anon key never writes. Every write goes through a route that verifies the owner and uses the service role. RLS on the new tables therefore only decides what the anon key may *read*; nothing private is readable by anon.
2. **One owner string, two ways to prove it.** A wallet proves itself with an ed25519 signature (existing); an email account proves itself with a Supabase Auth access token. Both end in the same `{ owner }` on the server (section 2).
3. **Pure logic in `src/lib`, thin routes.** Existing tests load `src/lib/*.ts` through `ts.transpileModule` (`tests/session.test.mjs:6-13`). New logic (plan parsing, condition evaluation, trigger mapping, the agent loop, the mock model, fill validation) lives in `src/lib` with relative imports so the same harness covers it. Routes are also testable directly: `next/server` loads under the harness and `NextRequest`/`NextResponse` behave (verified, section 16), given a six-line `@/` alias shim (section 13).
4. **Nothing invented.** No default order sizes (audit: `plans.js:48` invented $250), no seeded scores or comments, no fake tx ids on the tape. Practice fills are priced by the server from Jupiter Price v3 and labelled practice; live fills carry a real signature that the server checks on-chain before it appears on the tape.
5. **The agent never signs and never arms.** Its tools create *proposals*; a human tap arms a plan or submits a ticket.
6. **Free tier only.** Vercel Hobby (cron once a day, legacy functions 10 s default / 60 s max, fluid 300 s — section 8), Supabase Free (500 MB, 2 auth emails/hour on the built-in sender, projects pause after a week idle), Jupiter's keyless `lite-api.jup.ag` host (verified for Trigger V2, section 9). The only paid thing is the future `ANTHROPIC_API_KEY`.

---

## 2. Identity model

### 2.1 The `owner` string

```ts
// src/lib/owner.ts (pure, client-safe)
export type OwnerKind = "wallet" | "user";
const WALLET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;                       // base58, no 0 O I l
const USER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/; // auth.users.id
export function ownerKind(owner: string): OwnerKind | null {
  return WALLET.test(owner) ? "wallet" : USER.test(owner) ? "user" : null;
}
export function isOwner(s: unknown): s is string { return typeof s === "string" && ownerKind(s) !== null; }
```

- A wallet user's owner is the base58 address, exactly what `messages.wallet` already stores, so no existing chat row changes meaning.
- An email user's owner is their `auth.users.id` (lowercase UUID with hyphens). The two alphabets cannot collide (base58 has no `-`).
- An email user who later links a wallet keeps the UUID as owner forever; the wallet becomes an attribute (`profiles.wallet`, `plans.wallet`, `live_fills.wallet`). Rows never re-key. A wallet that already owns a wallet-only profile cannot be linked to an email account (409; see 2.5) — merging two histories is out of scope for Thursday.
- SQL mirrors this with `public.is_owner(text)` (section 3.1) used as a check constraint on every `owner` column.

### 2.2 Sessions: one HMAC token, two claims

`src/lib/session-server.ts` keeps its `base64url(payload).hmac` design (lines 27-37) and the same secret derivation. The payload grows by one optional claim and the verifier returns the owner:

```ts
interface Payload { w?: string; u?: string; exp: number }            // exactly one of w | u
export interface Session { owner: string; kind: OwnerKind; wallet?: string; userId?: string; expiresAt: number }
export function issueSessionToken(identity: { wallet: string } | { userId: string }, now = Date.now()): { token; expiresAt }
export function verifySessionToken(token, now = Date.now()): Session | null   // rejects payloads with both or neither claim
export function sessionFromHeader(header: string | null): Session | null       // unchanged signature, richer result
```

Old tokens (`{ w, exp }`) keep verifying: `w` maps to `owner = w, kind = "wallet"`. `tests/session.test.mjs:21-35` stays green after changing `.wallet` assertions to `.owner` (and adding `.wallet`).

### 2.3 `POST /api/session` — accept either proof

```ts
// Body A (existing, unchanged): { wallet, issuedAt, signature }          → verifyWalletSignature over buildSignInMessage
// Body B (new):                 { supabaseAccessToken: string }         → user id from Supabase Auth
// Response (both):              { token, owner, kind, wallet?, expiresAt }
```

Body B verification, server-side, with the service client (`getSupabaseService()`):

```ts
const { data, error } = await service.auth.getUser(body.supabaseAccessToken);   // GoTrueClient.getUser(jwt?: string) — verified in
if (error || !data.user) return 401;                                             // node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts:1591
return issueSessionToken({ userId: data.user.id });
```

`getUser(jwt)` round-trips to the Auth server, which is the recommended way to trust a token that arrived in a header (the d.ts at line 1413 says a locally decoded session "must not be trusted" without verification; `getClaims(jwt)` at line 2558 is the local-JWKS alternative and is a drop-in later). Either way the route needs no JWT secret in env.

Why mint our own token for email users instead of sending the Supabase access token on every request: every write route already understands the Bearer HMAC token (`sessionFromHeader`), the agent chat and the evaluator's owner-scoped fallback use the same header, the client stores one `StoredSession` shape (`src/lib/session.ts:9-13`) for both kinds, and Supabase access tokens expire hourly while ours last 30 days (`SESSION_TTL_MS`). The Supabase session still exists in the browser (for password changes and sign-out) but the app's routes never see it.

### 2.4 `requireOwner()` — the one helper every write route calls

```ts
// src/lib/auth-server.ts
export async function requireOwner(request: NextRequest): Promise<Session>   // throws HttpError(401) with the user-facing message
// order: Authorization: Bearer <hmac token>  → sessionFromHeader
//        (no other source; cookies are not read — see 2.6)
```

Routes that need a wallet (live plans, live fills) additionally check `session.wallet` (wallet users) or `profiles.wallet` (email users who linked one) and reply 403 "Connect a wallet to trade live."

### 2.5 `/api/profile` — nullable wallet, `user_id`, linking

`GET /api/profile?wallets=a,b` is unchanged. Add `GET /api/profile?owners=a,b` (wallets or user ids, ≤100) returning `{ profiles: Record<owner, Profile> }` so the tape, comments and leaderboard resolve any author. `Profile` gains `owner: string`, `kind: OwnerKind`, and `wallet: string | null` (was `string`).

`POST /api/profile` accepts three bodies:

| Body | Proof | Effect |
| --- | --- | --- |
| `{ wallet, profile, issuedAt, signature }` (existing) | ed25519 over `buildProfileClaimMessage` | upsert on `wallet` (unchanged code path, `route.ts:72-101`) |
| `{ profile }` with `Authorization: Bearer <session>` where `kind === "user"` | HMAC session | upsert on `user_id` |
| `{ link: { wallet, issuedAt, signature } }` with a `kind === "user"` session | ed25519 over `buildWalletLinkMessage(userId, wallet, issuedAt)` (new pure function in `profiles.ts`, same shape as the claim message: `"Solera wallet link" / Account: <uuid> / Wallet: <addr> / Issued: <iso>`) | sets `profiles.wallet` on the user's row; 409 if that wallet already has a profile row |

Handle uniqueness across both kinds is the existing `profiles_handle_unique on lower(handle)` index (`schema.sql:22`); the upsert conflict message "That handle is taken." (`route.ts:103-104`) stays.

Supabase dashboard settings (the user runs these; none are in code): Authentication → Providers → Email: enabled; "Confirm email" **off** (decision default; the built-in sender allows 2 emails/hour — verified, section 16); minimum password length 8; Site URL `https://trysolera.vercel.app`, additional redirect `http://localhost:3000`.

### 2.6 Browser client, and why no `proxy.ts` this week

`src/lib/supabase-browser.ts` exports a singleton `createClient(url, anonKey)` from `@supabase/supabase-js` (already a dependency) with `auth: { persistSession: true, autoRefreshToken: true }`. The sign-up sheet calls `supabase.auth.signUp({ email, password })` then `signInWithPassword` (both in `GoTrueClient.d.ts:456, 589`); on success it calls `POST /api/session` with `data.session.access_token` and stores the HMAC token through `saveSession()` (`use-session.ts:28`). A `useAuthUser()` hook wraps `supabase.auth.onAuthStateChange` for the account sheet.

`@supabase/ssr` (latest 0.12.7, peer `@supabase/supabase-js ^2.114.0`, verified with `npm view`) is only needed when the *server* must read the Supabase session from cookies (server components, or routes that use `auth.uid()` RLS). Neither applies: every screen is a client component reading through hooks, and RLS cannot use `auth.uid()` for wallet owners anyway (they are not Supabase Auth users). Skipping it removes the cookie plumbing and the refresh hook.

If it is added later, the Next 16 file is `src/proxy.ts` exporting `proxy(request)` (the `middleware` convention is deprecated and renamed; `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:11-13`), with `createServerClient(url, anon, { cookies: { getAll, setAll } })` from `@supabase/ssr` (its d.ts requires both `getAll` and `setAll`, and warns that omitting `setAll` causes random logouts).

### 2.7 Chat becomes owner-authored

`messages` gains `owner` (section 3.2); `/api/chat` POST inserts `{ room, owner: session.owner, wallet: session.wallet ?? null, body }` and the cooldown query filters on `owner`. `src/lib/chat.ts` `MessageRow`/`rowToMessage` and `ChatMessage` (`types.ts:145-152`) rename `wallet` → `author` (the owner string); the room UI resolves names through `/api/profile?owners=`.

---

## 3. SQL migration: `supabase/port.sql`

Run once in the Supabase SQL editor after `schema.sql` and `chat.sql`. Idempotent where Postgres allows it; the profile primary-key swap is guarded so a second run is a no-op.

```sql
-- supabase/port.sql — Solera port: identity, practice ledger, fills, plans, inbox, feed.
-- Run after schema.sql and chat.sql. Every write still goes through the server (service role);
-- RLS below only decides what the anon key may READ.

-- 3.1 owner format ------------------------------------------------------------
create or replace function public.is_owner(o text) returns boolean
language sql immutable as $$
  select o ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'                                   -- wallet (base58)
      or o ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';  -- auth.users.id
$$;

-- 3.2 profiles: surrogate key, nullable wallet, auth user link -----------------
alter table public.profiles add column if not exists id uuid not null default gen_random_uuid();
alter table public.profiles add column if not exists user_id uuid unique references auth.users(id) on delete cascade;
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'profiles_pkey'
             and conrelid = 'public.profiles'::regclass
             and pg_get_constraintdef(oid) like '%(wallet)%') then
    alter table public.profiles drop constraint profiles_pkey;
    alter table public.profiles add primary key (id);
  end if;
end $$;
alter table public.profiles alter column wallet drop not null;
do $$ begin
  alter table public.profiles add constraint profiles_wallet_unique unique (wallet);
exception when duplicate_table or duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_identity check (wallet is not null or user_id is not null);
exception when duplicate_object then null; end $$;
-- The owner string (section 2.1): the auth user id when there is one, else the wallet.
alter table public.profiles add column if not exists owner text
  generated always as (coalesce(user_id::text, wallet)) stored;
create unique index if not exists profiles_owner_unique on public.profiles (owner);
-- profiles_handle_unique on lower(handle) (schema.sql:22) already spans both identity kinds.

-- messages: author becomes the owner string; wallet kept for old rows and wallet authors.
alter table public.messages add column if not exists owner text;
update public.messages set owner = wallet where owner is null;
alter table public.messages alter column owner set not null;
alter table public.messages alter column wallet drop not null;
do $$ begin
  alter table public.messages add constraint messages_owner_format check (public.is_owner(owner));
exception when duplicate_object then null; end $$;
create index if not exists messages_owner_created on public.messages (owner, created_at desc);

-- 3.3 practice ledger -------------------------------------------------------------
-- One row per owner. holdings is the exact PortfolioBalances.holdings shape applyFill()
-- (src/lib/ledger.ts:5-8) takes: [{ "ticker": "AAPLx", "shares": 1.5, "costBasis": 231.2 }].
create table if not exists public.practice_portfolios (
  owner       text primary key check (public.is_owner(owner)),
  cash        numeric(18,6) not null check (cash >= 0),
  holdings    jsonb not null default '[]'::jsonb check (jsonb_typeof(holdings) = 'array'),
  version     integer not null default 1,             -- optimistic concurrency (section 4.3)
  imported_at timestamptz,                             -- set when seeded from localStorage
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 3.4 plans (before fills, which reference it) -------------------------------------
create table if not exists public.plans (
  id                  uuid primary key default gen_random_uuid(),
  owner               text not null check (public.is_owner(owner)),
  wallet              text,                            -- required for mode = 'live'
  mode                text not null check (mode in ('practice','live')),
  execution           text not null default 'server'
                      check (execution in ('server','trigger','notify')),
  text                text not null check (char_length(text) between 1 and 280),
  condition           jsonb not null,                  -- PlanCondition, section 6.1
  summary             text not null,                   -- describe(condition), shown to the user
  status              text not null default 'proposed'
                      check (status in ('proposed','armed','holding','ready','done','failed','expired','cancelled')),
  arm_until           timestamptz,                     -- trigger window
  hold_until          timestamptz,                     -- exit window after a fill
  trigger_order_id    text,                            -- Jupiter Trigger V2 order id
  trigger_deposit_sig text,                            -- on-chain deposit signature, verified by the server
  trigger_state       text,                            -- last orderState mirrored from Jupiter
  trigger_checked_at  timestamptz,
  ready_at            timestamptz,                     -- notify fallback: condition met, awaiting the tap
  notified_at         timestamptz,
  filled              jsonb,                           -- { "price", "shares", "at", "fillId" }
  log                 jsonb not null default '[]'::jsonb,
  source              text not null default 'ui' check (source in ('ui','agent')),
  evaluated_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint plans_live_needs_wallet check (mode = 'practice' or wallet is not null),
  constraint plans_trigger_needs_order
    check (execution <> 'trigger' or status = 'proposed' or trigger_order_id is not null)
);
create index if not exists plans_active on public.plans (status) where status in ('armed','holding','ready');
create index if not exists plans_owner_created on public.plans (owner, created_at desc);

-- 3.5 fills --------------------------------------------------------------------------
create table if not exists public.practice_fills (
  id              uuid primary key default gen_random_uuid(),
  owner           text not null check (public.is_owner(owner)),
  ticker          text not null check (ticker ~ '^[A-Z0-9.]{1,12}x$'),
  side            text not null check (side in ('buy','sell')),
  quantity        numeric(24,10) not null check (quantity > 0),
  price_per_share numeric(18,6) not null check (price_per_share > 0),
  total_value     numeric(18,6) not null check (total_value > 0),
  note            text check (char_length(note) <= 280),
  wrong_if        text check (char_length(wrong_if) <= 160),
  leg             text check (leg in ('gap','mark')),
  via             text not null default 'ticket' check (via in ('ticket','plan','agent','copy')),
  plan_id         uuid references public.plans(id) on delete set null,
  copied_from     text,
  created_at      timestamptz not null default now()
);
create index if not exists practice_fills_owner_created on public.practice_fills (owner, created_at desc);
create index if not exists practice_fills_created on public.practice_fills (created_at desc);

create table if not exists public.live_fills (
  id              uuid primary key default gen_random_uuid(),
  owner           text not null check (public.is_owner(owner)),
  wallet          text not null,
  signature       text not null unique,                -- Solana tx signature; verified on-chain (section 5.3)
  ticker          text not null check (ticker ~ '^[A-Z0-9.]{1,12}x$'),
  side            text not null check (side in ('buy','sell')),
  quantity        numeric(24,10) not null check (quantity > 0),
  price_per_share numeric(18,6) not null check (price_per_share > 0),
  total_value     numeric(18,6) not null check (total_value > 0),
  settled_in      text check (settled_in in ('SOL','USDC')),
  settled_amount  numeric(24,10),
  note            text check (char_length(note) <= 280),
  wrong_if        text check (char_length(wrong_if) <= 160),
  leg             text check (leg in ('gap','mark')),
  via             text not null default 'ticket' check (via in ('ticket','plan','agent','copy')),
  plan_id         uuid references public.plans(id) on delete set null,
  copied_from     text,
  verified        boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists live_fills_owner_created on public.live_fills (owner, created_at desc);
create index if not exists live_fills_created on public.live_fills (created_at desc);

-- 3.6 inbox (notify fallback) ---------------------------------------------------------
create table if not exists public.inbox (
  id          uuid primary key default gen_random_uuid(),
  owner       text not null check (public.is_owner(owner)),
  kind        text not null check (kind in ('plan_ready','plan_filled','plan_failed','plan_expired','plan_cancelled')),
  plan_id     uuid references public.plans(id) on delete cascade,
  title       text not null check (char_length(title) <= 120),
  body        text not null default '' check (char_length(body) <= 500),
  href        text,                                    -- e.g. /asset/TSLAx?plan=<id>
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists inbox_owner_unread on public.inbox (owner, created_at desc) where read_at is null;

-- 3.7 feed: posts, votes, comments --------------------------------------------------------
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('news','practice_fill','live_fill')),
  ref           text not null,                         -- news: sha256(canonical url); fills: the fill id
  ticker        text check (ticker ~ '^[A-Z0-9.]{1,12}x$'),
  owner         text check (owner is null or public.is_owner(owner)),   -- fill author; null for news
  title         text not null check (char_length(title) between 1 and 300),
  url           text,
  source        text,
  published_at  timestamptz,
  score         integer not null default 0,            -- maintained by trigger
  comment_count integer not null default 0,            -- maintained by trigger
  created_at    timestamptz not null default now(),
  unique (kind, ref)
);
create index if not exists posts_created on public.posts (created_at desc);
create index if not exists posts_ticker_created on public.posts (ticker, created_at desc);

create table if not exists public.votes (
  post_id     uuid not null references public.posts(id) on delete cascade,
  owner       text not null check (public.is_owner(owner)),
  dir         smallint not null check (dir in (-1, 1)),
  created_at  timestamptz not null default now(),
  primary key (post_id, owner)
);

create table if not exists public.comments (
  id          bigint generated always as identity primary key,
  post_id     uuid not null references public.posts(id) on delete cascade,
  owner       text not null check (public.is_owner(owner)),
  body        text not null check (char_length(body) between 1 and 280),
  created_at  timestamptz not null default now()
);
create index if not exists comments_post_created on public.comments (post_id, created_at);
create index if not exists comments_owner_created on public.comments (owner, created_at desc);

create or replace function public.posts_recount() returns trigger
language plpgsql as $$
declare pid uuid := coalesce(new.post_id, old.post_id);
begin
  update public.posts p set
    score         = (select coalesce(sum(v.dir), 0) from public.votes v where v.post_id = pid),
    comment_count = (select count(*) from public.comments c where c.post_id = pid)
  where p.id = pid;
  return null;
end $$;
drop trigger if exists votes_recount on public.votes;
create trigger votes_recount after insert or update or delete on public.votes
  for each row execute function public.posts_recount();
drop trigger if exists comments_recount on public.comments;
create trigger comments_recount after insert or delete on public.comments
  for each row execute function public.posts_recount();

-- 3.8 RLS ------------------------------------------------------------------------------------
alter table public.practice_portfolios enable row level security;   -- no anon policy: server only
alter table public.plans               enable row level security;   -- no anon policy: server only
alter table public.inbox               enable row level security;   -- no anon policy: server only
alter table public.votes               enable row level security;   -- no anon policy: scores live on posts

alter table public.practice_fills enable row level security;
drop policy if exists "practice fills are readable unless the owner is private" on public.practice_fills;
create policy "practice fills are readable unless the owner is private"
  on public.practice_fills for select
  using (not exists (select 1 from public.profiles p where p.owner = practice_fills.owner and p.visibility = 'private'));

alter table public.live_fills enable row level security;
drop policy if exists "live fills are readable unless the owner is private" on public.live_fills;
create policy "live fills are readable unless the owner is private"
  on public.live_fills for select
  using (verified and not exists (select 1 from public.profiles p where p.owner = live_fills.owner and p.visibility = 'private'));

alter table public.posts enable row level security;
drop policy if exists "posts are readable" on public.posts;
create policy "posts are readable" on public.posts for select using (true);

alter table public.comments enable row level security;
drop policy if exists "comments are readable" on public.comments;
create policy "comments are readable" on public.comments for select using (true);

-- Optional realtime for the tape and comments (rooms already do this in chat.sql:27-32).
do $$ begin
  alter publication supabase_realtime add table public.practice_fills;
  alter publication supabase_realtime add table public.live_fills;
  alter publication supabase_realtime add table public.comments;
exception when duplicate_object then null; end $$;

-- 3.9 evaluator schedule (section 8.4) — run only after PLAN_EVALUATOR_SECRET is set on Vercel.
-- create extension if not exists pg_cron with schema pg_catalog;
-- create extension if not exists pg_net with schema extensions;
-- select vault.create_secret('<the same value as PLAN_EVALUATOR_SECRET>', 'plan_evaluator_secret');
-- select cron.schedule('solera-evaluate-plans', '* * * * *', $$
--   select net.http_post(
--     url := 'https://trysolera.vercel.app/api/plans/evaluate',
--     headers := jsonb_build_object('Content-Type', 'application/json',
--                'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'plan_evaluator_secret')),
--     body := '{}'::jsonb,
--     timeout_milliseconds := 9000) as request_id;
-- $$);
```

Notes on the migration:

- The profile PK swap is safe for existing rows: `id` fills from `gen_random_uuid()`, `wallet` stays unique through `profiles_wallet_unique`, and the existing `/api/profile` upsert `onConflict: "wallet"` (`route.ts:98`) keeps working because a unique constraint is all `upsert` needs.
- `profiles.owner` is a stored generated column so RLS policies and the tape can join `fills.owner = profiles.owner` without knowing the identity kind.
- `plan_id` on fills is `on delete set null` so cancelling or deleting a plan never deletes a fill.
- `live_fills` are visible only once `verified` (section 5.3), so an unverifiable signature can never appear on the public tape.
- The cron block is commented out because it embeds the deployment URL and needs the Vault secret first; section 8.4 has the enable/disable commands.

---

## 4. Practice ledger: localStorage → Supabase, without breaking the signed-out mode

### 4.1 Today

`src/hooks/use-portfolio.ts` keeps `{ cashBalance, holdings, transactions, optionPositions, optionTransactions }` under `localStorage["stocklana:portfolio"]` (line 19), seeds new visitors with `MY_CASH_BALANCE = 842.17` and three `MY_HOLDINGS` (`mock-data.ts:176-183`), validates on read (86-135), and applies fills through `applyFill` (`ledger.ts:18-68`). `executeTrade` in practice mode prices from the client's price store after a 1.4 s delay (`trade.ts:85-100`).

### 4.2 Target

| Visitor | Ledger lives in | Priced by | Standing plans |
| --- | --- | --- | --- |
| Signed out (no session) | `localStorage` as today, but **starts with no positions** (decision) and no options | client (`getEffectivePrice`) as today | not available (the Plans panel shows "Sign in to keep plans running while you're away") |
| Signed in (wallet session or email session) | `practice_portfolios` + `practice_fills`, keyed by `owner` | server (Jupiter Price v3 at fill time) | practice plans execute server-side |

`defaultState()` changes to `holdings: []` (the `MY_HOLDINGS` seed is dropped; `MY_CASH_BALANCE` stays the starting cash). Options state fields remain in the type for storage compatibility but are no longer written (practice options chain is cut).

### 4.3 Routes

```
GET  /api/practice                 → { portfolio: { cash, holdings, version, updatedAt } | null, fills: PracticeFill[] (latest 100) }
POST /api/practice/import          { cash, holdings, fills[] }  → seeds the row ONLY if none exists (409 otherwise)
POST /api/practice/fill            { ticker, side, quantity? | amountUsd?, note?, wrongIf?, leg?, via?, copiedFrom?, expectedVersion }
                                   → { fill: PracticeFill, portfolio, result: TradeResult }        (409 { portfolio } on version mismatch)
POST /api/practice/reset           → cash back to MY_CASH_BALANCE, holdings [], fills kept (they are history)
```

All four require `requireOwner()`. `POST /api/practice/fill`:

1. Validates the body with `validateFillInput()` (new, in `src/lib/fills.ts`): known ticker (`isKnownTicker` accepts any `^[A-Z0-9.]{1,12}x$` server-side, `catalog.ts:96-98`, then `findCatalogToken` for the mint), side, exactly one of `quantity` / `amountUsd`, `note ≤ 280`, `wrongIf ≤ 160`, `leg` only for pre-IPO buys (rule kept from `engine.js:466`, enforced server-side now).
2. Prices the ticker from Jupiter Price v3 (`src/lib/prices-server.ts`, extracted from `readJupiterPrices` in `live-prices/route.ts:190-204`, one call for one mint). If there is no price, 503 "No live price for X right now."
3. Loads the row, computes `applyFill(current, fill)` (unchanged pure function), and writes `update practice_portfolios set cash, holdings, version = version + 1 where owner = $1 and version = $expectedVersion`. Zero rows updated → 409 with the current portfolio; the client re-renders and asks again. This is the concurrency guard between a tap in the browser and the evaluator firing a plan in the same second.
4. Inserts `practice_fills`, and a `posts` row `(kind 'practice_fill', ref fill.id, ticker, owner, title = "<handle or short owner> bought 1.2 AAPLx · practice")` when the fill has a note (the tape shows every fill; the feed shows fills with a thesis — the partner's "every fill carries the sentence").
5. Returns the same `TradeResult` shape (`trade.ts:39-54`) with `mode: "practice"` and `txId: "PRACTICE<fill id prefix>"` so `TradeScreen.tsx:135` and the celebration code need no change.

Note is **optional but encouraged** (decision): the ticket offers it on every order; the server accepts an empty note.

### 4.4 Hook changes

`usePortfolio()` becomes a façade over two stores:

- `LocalPracticeStore` — today's module (validation and `useSyncExternalStore` kept).
- `ServerPracticeStore` — fetches `GET /api/practice` on sign-in, on window focus and every 15 s while the Portfolio or Plans panel is mounted (same cadence as `use-live-portfolio.ts:13`); `recordTrade` posts to `/api/practice/fill` and replaces the snapshot with the server's reply.

Selection: `useSession().signedIn ? server : local`. The returned shape is unchanged (`cashBalance, holdings, transactions, isLoaded, recordTrade`), so `use-active-portfolio.ts` needs no edit. `executeTrade()`'s practice branch is bypassed for signed-in users: `useExecuteTrade` calls `recordTrade` directly with the server's fill (the server is the fill).

### 4.5 Sync-on-sign-in

When a session appears and `GET /api/practice` returns `portfolio: null`:

1. Read the local store. If it is not the default (any holdings, or cash ≠ 842.17, or transactions), show a one-time sheet: "Keep your practice history? We'll move your practice cash, positions and N fills to your account." Buttons: **Move it** → `POST /api/practice/import` with `{ cash, holdings, fills: transactions.map(toFillInput) }` (server re-validates every fill row with the same checks as a live fill except pricing; imported fills are stored with `via: 'ticket'` and their original timestamp), then `localStorage.setItem("stocklana:portfolio:migrated", owner)` and the local store is reset to default. **Start fresh** → `POST /api/practice/reset` semantics (row created with starting cash), local store untouched (it keeps serving the signed-out mode on this device).
2. If the local store is the default, create the row silently by calling `POST /api/practice/reset`.

Switching wallets re-runs this with the new owner; the local store is never deleted, only reset after a successful import, so a failed import loses nothing.

---

## 5. Fills with a thesis, and the tape

### 5.1 Types

```ts
// src/lib/types.ts — added to Transaction and HoldingPosition (both optional)
note?: string;                 // the thesis, ≤ 280
wrongIf?: string;              // ≤ 160
leg?: "gap" | "mark";          // pre-IPO buys only
via?: "ticket" | "plan" | "agent" | "copy";
planId?: string;
```

`applyFill` (`ledger.ts`) does not change (a note is not a balance). `recordTrade` params in `use-portfolio.ts:184-215`, `use-live-portfolio.ts:131-156` and `use-active-portfolio.ts:24-32` gain the same optional fields. `HoldingPosition.thesis` (`types.ts:33`) is set from the most recent buy's `note` when a holding is (re)built, so `HoldingRow.tsx:44` shows it unchanged.

### 5.2 Deferred (iOS) fills keep the note

`Continuation` (`deferred-signing.ts:15-34`) `trade` payload gains `note?, wrongIf?, leg?, via?, planId?` on the `xstock` variant; `executeLiveSwap` already forwards `context.trade` verbatim (`trade.ts:149`), and `DeepLinkResumer.tsx:155` passes them to `recordLiveTrade` and to `POST /api/fills` (below). The audit's finding at line 172 is closed by this.

### 5.3 `POST /api/fills` — live fills on the public tape, verified

```
POST /api/fills  (session with a wallet)
{ signature, ticker, side, quantity, pricePerShare, totalValue, settledIn, settledAmount, note?, wrongIf?, leg?, via?, planId?, copiedFrom? }
→ 202 { fill: { id, verified: false } }  then verified asynchronously? — no: verified inline, see below
```

Inline verification (the route runs ≤ 3 s): `new Connection(SOLANA_RPC).getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" })`; require the transaction exists, `meta.err === null`, and `transaction.message.staticAccountKeys[0].toBase58() === session.wallet` (the fee payer of a Jupiter Ultra swap is the taker, `trade.ts:128`). On success insert with `verified = true` and create the `posts` row (`kind 'live_fill'`, `ref = signature`). If the RPC is slow or the tx is not yet visible, insert with `verified = false` and return 202; the evaluator's housekeeping pass (section 8.3, step 6) retries verification for up to 30 minutes, then deletes the row. The tape and RLS only ever show `verified` rows.

The client still records the fill locally (`recordLiveTrade`) for cost basis; the server row is what other people see.

### 5.4 The tape

`GET /api/tape?limit=50&ticker=AAPLx` → newest 50 across both fill tables (`union all` in one query, the two tables have the same columns; practice rows flagged `mode: 'practice'`), joined to `profiles` for handle and visibility. Anon-readable through RLS, so the client may also subscribe to Realtime inserts on both tables for a live tape.

---

## 6. Plans

### 6.1 Condition schema (`src/lib/plans.ts`)

The partner's plan object (`plans.js:70`) is the template, with the audit's corrections: explicit trigger direction, no default amounts, share-based sells, separate arm/hold windows, no "opens at".

```ts
export interface PlanCondition {
  ticker: TickerSymbol;                                            // "AAPLx"; catalog tickers allowed
  trigger:
    | { kind: "now" }                                              // only valid for tickets, never for a standing plan
    | { kind: "price"; op: "gte" | "lte"; price: number };         // xStock USD price (Jupiter), 24/7
  action:
    | { side: "buy"; amountUsd: number }
    | { side: "buy"; shares: number }
    | { side: "sell"; shares: number }
    | { side: "sell"; fraction: number };                          // 0 < fraction ≤ 1, resolved to shares at fill time
  exits: Array<{ kind: "target" | "stop"; price: number }>;        // buys only; ≤ 1 target, ≤ 1 stop
  wrongIf?: string;                                                // human condition, ≤ 160, shown on the position, never evaluated
  leg?: "gap" | "mark";                                            // pre-IPO only; not evaluable this week (section 15)
  note?: string;                                                   // thesis carried onto the fill
  payWith?: "SOL" | "USDC";                                        // live buys; default SOL (tokens.ts:19-24)
}
export function validateCondition(c: unknown, ctx: { price?: number }): string | null;   // user-facing error or null
export function describe(c: PlanCondition): string;
// "when AAPLx rises to $345.00 → buy $250.00 · then hold until target $360.00 or stop $330.00 · wrong if “deliveries miss”"
export function met(trigger: PlanCondition["trigger"], price: number): boolean;         // gte: price >= p; lte: price <= p
export function exitHit(exits, price): { kind; price } | null;                          // target: price >= p; stop: price <= p
```

Validation rules (all tested): a standing plan needs `trigger.kind === "price"`; `amountUsd ≥ 1` or `shares > 0` — never inferred; a `gte` trigger with a stop above it or `lte` with a target below it is rejected ("Your stop is above your entry."); at most one target and one stop; `ticker` must resolve through `findCatalogToken` on the server.

### 6.2 Statuses

`proposed` (created by the UI preview or the agent, not yet confirmed) → `armed` (the human tapped Arm) → `holding` (buy filled, exits pending) → `done`; side exits: `ready` (notify fallback: condition met, waiting for the one-tap sign), `failed` (fill rejected: no cash, no position, no price), `expired` (`arm_until` passed while armed, or `hold_until` passed while holding — both windows, closing the audit's finding at `plans.js:85`), `cancelled`. Every transition appends `{ at, from, to, msg }` to `log`.

### 6.3 Routes

```
GET    /api/plans                              → { plans: Plan[] }  (owner's, newest first, 100)
POST   /api/plans      { text, condition, mode, source?, note? }
                                               → { plan (status 'proposed'), live?: LivePreview }   (section 9.3)
PATCH  /api/plans/:id  { status: 'armed' }                       practice, or live+notify → arms
                       { status: 'armed', trigger: { orderId, depositSignature } }   live+trigger → verifies then arms (section 9.4)
                       { status: 'cancelled' }                   practice / notify: immediate; trigger: only after confirm-cancel (9.6)
                       { status: 'done', fillId }                notify fallback: the tap's fill landed
                       { triggerState, filled? }                 client-side Jupiter sync (9.7)
DELETE /api/plans/:id                          → only 'proposed' rows (drafts); everything else is history
```

`POST /api/plans` re-validates the condition server-side, computes `summary = describe(condition)`, decides `execution` (`practice → 'server'`; `live → 'trigger'` when `toTriggerOrder()` succeeds, else `'notify'`), stores `arm_until` (default 30 days, the partner's "for N days" maps here) and `hold_until` (default null = until an exit hits). For `live` it needs `session.wallet` or the linked wallet (403 otherwise).

Cancelling a practice plan mid-`holding` leaves the position (the plan stops watching exits; the UI says so).

---

## 7. `/api/agent`

### 7.1 Shape

```
POST /api/agent   (optional session; write tools require one)
{ messages: Array<{ role: 'user' | 'assistant'; content: string }>,   // plain text, ≤ 12 turns, ≤ 4 000 chars each
  mode: 'practice' | 'live',
  context?: { ticker?: TickerSymbol; page?: string } }
→ AgentResponse
```

```ts
export interface AgentResponse {
  model: "anthropic" | "mock";
  reply: string;                                   // what the Agent tab renders as the assistant bubble (plain text, short)
  cards: AgentCard[];                              // rendered under the bubble, in order
  toolTrace: Array<{ name: string; ok: boolean; ms: number }>;   // debug drawer
  usage?: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number };
}
export type AgentCard =
  | { kind: "plan";   planId: string; summary: string; mode; execution: "server" | "trigger" | "notify"; status: "proposed" }   // → "Arm it" button → PATCH /api/plans/:id
  | { kind: "ticket"; ticker; side; amountUsd?; shares?; note?; mode }                                                            // → prefilled ticket → normal fill path
  | { kind: "news";   ticker?; company?; items: NewsItem[] }                                                                      // NewsItem from src/lib/news.ts:10-19
  | { kind: "prices"; prices: Record<TickerSymbol, number>; fetchedAt: number }
  | { kind: "plans";  plans: Array<{ id; summary; status; mode }> }
  | { kind: "explain"; planId: string; text: string };
```

Transcript handling: the client keeps the plain-text history (assistant `reply` strings, not content blocks). Each request runs its own tool loop to completion, so tool-use blocks never cross requests; the model gets fresh state each turn from the state block (7.3). This is deliberate: it keeps the wire format model-agnostic (the mock and Claude produce identical `AgentResponse`s) and avoids persisting Anthropic content blocks.

Route file: `src/app/api/agent/route.ts` with `export const maxDuration = 60;` (route segment config; `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`) — a tool-using Opus turn can exceed the legacy 10 s Hobby default (section 8.1).

### 7.2 Model abstraction

```ts
// src/lib/agent/model.ts
export interface AgentModel {
  name: "anthropic" | "mock";
  complete(req: { system: string; tools: ToolDef[]; messages: Msg[] }): Promise<Turn>;
}
// Msg and Turn use the SDK's own shapes so the Anthropic adapter is a pass-through:
//   Msg  = Anthropic.MessageParam, Turn = Pick<Anthropic.Message, "content" | "stop_reason" | "usage">
export function selectModel(env = process.env): AgentModel   // SOLERA_AGENT_MODEL=mock|anthropic; default anthropic iff ANTHROPIC_API_KEY set, else mock
```

`AnthropicModel` (`src/lib/agent/anthropic-model.ts`, `npm i @anthropic-ai/sdk` — 0.128.0 at time of writing):

```ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();                                   // reads ANTHROPIC_API_KEY
const res = await client.messages.create({
  model: process.env.SOLERA_AGENT_MODEL_ID ?? "claude-opus-5",
  max_tokens: 2048,                                               // replies are short; tools carry the data
  system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],   // stable prefix → cached
  tools: TOOLS,                                                   // stable order, each strict: true
  messages,
  output_config: { effort: "low" },                               // chat-shaped task; thinking stays on (adaptive by default on Opus 5)
});
return { content: res.content, stop_reason: res.stop_reason, usage: res.usage };
```

Volatile content (mode, ticker in view, the owner's open plans, "now") goes into the **first user message** as a `<state>` block, never into `system`, so the cached prefix is byte-stable across users. The SDK's typed errors map to HTTP: `Anthropic.AuthenticationError` → 501 "Agent isn't configured on this deployment yet.", `RateLimitError` → 429, other `APIError` → 502, all with the mock never involved. Model choice is the user's (section 15).

### 7.3 System prompt (the rules, verbatim)

```
You are Solera's agent inside a trading app for tokenized stocks (xStocks on Solana) with a practice mode and a live mode.
You help people express standing plans in plain words, look up prices and news, and manage their plans. You do not trade.

Rules:
1. No advice. Never recommend, rank, forecast, or say whether a trade is a good idea. If asked, say Solera doesn't give advice and offer the facts you can fetch.
2. Never invent numbers. Prices come from get_prices, headlines from get_news, tickers from get_catalog. Quote headlines verbatim with their source; do not summarize news into claims.
3. Every plan needs an explicit size: a dollar amount or a number of shares. If the person didn't give one, ask once; never assume.
4. You never arm or execute anything. create_plan and place_practice_order produce proposals that the person confirms with a tap in the app. After calling one, say what it will do in one sentence and that it needs their confirmation. Never say a plan is armed, live, filled, or placed.
5. You never sign, hold keys, move funds, or see the wallet's private key. Live plans are signed by the person's wallet; say so when relevant.
6. Practice mode fills use practice cash. Live mode needs a connected wallet; if mode is practice and the person asks for a live plan, say they can switch modes.
7. Triggers are on the xStock's USD price and are checked about once a minute in practice; live price-triggered plans are watched by Jupiter's keepers. Say "when the price is at or above/below" rather than promising exact fills.
8. Keep replies under 80 words unless listing news. Plain text, no markdown headers. Ask at most one question per turn.
9. If the request is outside these tools (options, account changes, other chains, anything about a person), say what you can't do in one sentence.
The <state> block in the first user message is the current app state; trust it over the conversation history.
```

### 7.4 Tools (JSON Schemas, all `strict: true`, `additionalProperties: false`)

```ts
// src/lib/agent/tools.ts — TOOLS: Anthropic.Tool[] (strict: true on each; execute() below runs them)
get_prices     { tickers: string[] (1..20) }                                    → { prices: Record<ticker, usd>, solUsd?, fetchedAt }   // src/lib/prices-server.ts (Jupiter Price v3 via findCatalogToken)
get_news       { ticker?: string; company?: 'openai'|'anthropic'|'spacex'|'kalshi'|'anduril'|'neuralink'|'polymarket'|'figureai' } (exactly one)
                                                                                 → { items: NewsItem[] (≤ 8), source, fetchedAt }       // src/lib/news-server.ts (section 11)
get_catalog    { query: string (1..40) }                                         → { tokens: [{ symbol, name, mint, usdPrice?, liquidityUsd? }] (≤ 10) }   // getCatalog() filtered by symbol/name
create_plan    { text: string; condition: PlanCondition (the 6.1 schema inlined as JSON Schema); mode: 'practice'|'live' }
                                                                                 → { planId, summary, execution, status: 'proposed' } | { error }       // requires owner
list_plans     { status?: 'active'|'past' }                                      → { plans: [{ id, summary, status, mode, createdAt }] }                  // requires owner
cancel_plan    { planId: string }                                                → { planId, status: 'cancelled' } | { error }   // practice & notify only; for trigger plans returns { needsSignature: true } and the UI shows the cancel flow
place_practice_order { ticker; side; amountUsd? ; shares?; note? } (exactly one of amountUsd/shares)
                                                                                 → { ticket } (a proposal card; nothing is filled)
explain_plan   { planId: string }                                                → { text }   // describe() + status + log tail, no model needed
```

Each `input_schema` has `required` listing every property (strict mode needs it; optional fields use `["string","null"]` types). `execute(name, input, ctx)` in `src/lib/agent/execute.ts` validates `input` against the schema again with a tiny hand-written validator per tool (the SDK guarantees schema-valid input in strict mode, but the mock model does not go through the API), calls the same `src/lib` functions the routes use (never HTTP to itself), and returns `{ content: JSON.stringify(result), is_error?: true }`. A tool that needs an owner and has none returns `is_error` with "Sign in to create plans." so the model can say so.

### 7.5 The loop (`src/lib/agent/run.ts`)

Manual loop, not the SDK tool runner: the runner is a beta helper that owns the request, and this loop must run unchanged against `MockModel`.

```ts
export async function runAgent(model: AgentModel, req: AgentRequest, ctx: ToolContext): Promise<AgentResponse> {
  const messages: Msg[] = toMessages(req);                  // first user message = <state> block + text
  const cards: AgentCard[] = []; const trace = [];
  for (let iteration = 0; iteration < 6; iteration++) {
    const turn = await model.complete({ system: SYSTEM_PROMPT, tools: TOOLS, messages });
    if (turn.stop_reason === "refusal") return { reply: "I can't help with that one.", cards, ... };
    if (turn.stop_reason === "max_tokens") throw new HttpError(502, "The agent's reply was cut off. Try a shorter question.");
    const uses = turn.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (turn.stop_reason !== "tool_use" || uses.length === 0) return { reply: textOf(turn), cards, trace, usage };
    messages.push({ role: "assistant", content: turn.content });
    const results = await Promise.all(uses.map((u) => timed(() => execute(u.name, u.input, ctx))));   // parallel, as the API expects
    results.forEach((r, i) => { trace.push(...); if (r.card) cards.push(r.card); });
    messages.push({ role: "user", content: results.map((r, i) => ({ type: "tool_result", tool_use_id: uses[i].id, content: r.content, is_error: r.isError })) });
  }
  throw new HttpError(502, "The agent took too many steps.");
}
```

All tool results for one assistant turn go back in a single user message (parallel tool use contract). `create_plan`/`place_practice_order` results become cards **from the tool result, not from the model's text**, so a UI card can never claim something the server did not do.

### 7.6 `MockModel` — deterministic, covers the three canonical prompts

`src/lib/agent/mock-model.ts`. It emits the same `tool_use` blocks Claude would, then a final text after it sees `tool_result`s. It is a small rule set over the *last user message*, plus the pending-question memory that the `<state>` block carries (`state.pendingSize` is the last unsized plan draft the mock asked about):

| Last user message | Turn 1 | Turn 2 (after tool results) |
| --- | --- | --- |
| `buy AAPLx if it goes over $345` (no size) | text only: "How much AAPLx — a dollar amount or a number of shares?" (no tool call, per rule 3); the route stores the draft in the reply's hidden `pendingSize` field of the next state block | — |
| `$250` / `250 dollars` / `2 shares` while a draft is pending | `tool_use create_plan { text: draft + size, condition: { ticker:'AAPLx', trigger:{kind:'price',op:'gte',price:345}, action:{side:'buy',amountUsd:250}, exits:[] }, mode }` | "Proposed: when AAPLx is at or above $345.00, buy $250.00 (practice). Tap Arm it to start it." (from the tool result's `summary`) |
| `show me the latest news on TSLAx` | `tool_use get_news { ticker:'TSLAx' }` | "Latest on Tesla (Finnhub): 1. <headline> — <source>, 2. …" — headlines copied verbatim from the tool result |
| `if TSLAx falls to $300 sell 5 shares` | `tool_use create_plan { …trigger lte 300, action sell shares 5… }` | "Proposed: when TSLAx is at or below $300.00, sell 5 shares. Tap Arm it to start it." |
| `what's AAPLx at` / `price of …` | `tool_use get_prices` | "AAPLx: $231.20 (Jupiter, 12:03Z)." |
| `my plans` / `list plans` | `tool_use list_plans` | one line per plan |
| `cancel <id or ordinal>` | `tool_use cancel_plan` | confirmation from the result |
| anything else | text: "I can set up price plans (“buy $100 of NVDAx if it drops to 170”), fetch prices and news, and list or cancel your plans." | — |

Grammar for the mock (documented so tests can pin it; none of the partner's regexes are reused): ticker = any token matching `/\b([A-Z0-9.]{1,11})x?\b/` resolved through the catalog (case-insensitive `aaplx`, `aapl`, `tesla` via `name`); direction words `over|above|rises? to|climbs? (to|past)` → `gte`, `under|below|falls? to|drops? to|dips? to` → `lte`; price = the number following the direction phrase; size = `\$\s?([\d,]+(\.\d+)?)` → `amountUsd`, `(\d+(\.\d+)?)\s*shares?` → `shares`, `(all|half|a third|a quarter)` on a sell → `fraction`. If the direction is missing ("buy AAPLx at 345"), the mock asks: "Above or below $345?" — direction is never guessed from the current price (audit, `plans.js:38`).

The response carries `model: "mock"` and the Agent tab shows a small "offline parser — no model attached" pill, so nobody mistakes it for Claude. `SOLERA_AGENT_MODEL=mock` forces it even when a key is present (for demos and tests).

---

## 8. The plan evaluator

### 8.1 Constraints (verified)

- Vercel Hobby cron: "Hobby accounts are limited to cron jobs that run once per day … Cron expressions that would run more frequently will fail during deployment"; timing precision ±59 min (`vercel.com/docs/cron-jobs/usage-and-pricing`, fetched Sept 22). Unusable for a minute-level watcher.
- Vercel Hobby function duration: projects created before April 23 2025 without Fluid compute: 10 s default / 60 s max; with Fluid compute: 300 s default and max (`vercel.com/docs/functions/limitations`, `/docs/limits`). The evaluator is designed to finish in **≤ 8 s** per invocation regardless (it re-queues remaining work), and the agent route sets `maxDuration = 60`.
- Supabase Free: pg_cron is a dashboard toggle ("Cron Postgres Module under Integrations") or `create extension pg_cron with schema pg_catalog;` (`supabase.com/docs/guides/cron/install`); schedules run "anywhere from every second to once a year"; `pg_net` provides `net.http_post(url, body, params, headers, timeout_milliseconds) returns bigint` and stores responses in `net._http_response` for 6 hours (`/docs/guides/database/extensions/pg_net`). Neither page states plan gating; both are extensions on the existing project, not billed services. Free projects **pause after one week without activity** (`supabase.com/pricing`) — the evaluator's own writes are API activity through PostgREST, which should keep it warm, but this is unproven (section 15).
- GitHub Actions: shortest schedule 5 minutes, "can be delayed during periods of high loads … High load times include the start of every hour", disabled after 60 days of inactivity on public repos; private-repo Free allotment 2 000 min/month (`docs.github.com`). Every-5-minutes = 8 640 runs/month, each billed as at least a minute → over the allotment.

### 8.2 Options

| Option | Cost | Cadence | Reliability | Verdict |
| --- | --- | --- | --- | --- |
| Vercel cron | free | once/day | fine for housekeeping only | **use for the daily housekeeping pass only** (`vercel.json` `"crons": [{ "path": "/api/plans/evaluate?pass=daily", "schedule": "0 9 * * *" }]`) |
| Supabase pg_cron + pg_net → `POST /api/plans/evaluate` | free | every minute | runs inside the DB the plans live in; response log in `net._http_response`; job history in `cron.job_run_details` | **recommended primary** |
| pg_cron → Supabase Edge Function that evaluates | free (500 K invocations/month) | every minute | same scheduler; but duplicates the pricing/ledger code in Deno, a second deploy target | no |
| GitHub Actions schedule → curl | free within 2 000 min | ≥ 5 min, jittery | over the minute allotment at 5-min cadence; needs the secret in repo secrets | backup only, at `*/15`, if pg_cron is ever unavailable |
| Browser (the open tab) | free | 60 s while open | exactly the partner's weakness (audit, plans.js:174) | **always-on degraded fallback, owner-scoped** (8.5) |

### 8.3 `POST /api/plans/evaluate`

```
POST /api/plans/evaluate?pass=minute|daily        Authorization: Bearer <PLAN_EVALUATOR_SECRET>   (timingSafeEqual; 401 otherwise)
POST /api/plans/evaluate?scope=self               Authorization: Bearer <owner session>            (browser fallback: only this owner's plans)
→ { pass, scanned, fired, exited, expired, notified, remaining, ms }
```

Route: `src/app/api/plans/evaluate/route.ts` → `evaluatePlans(deps, opts)` in `src/lib/plans-evaluator.ts` where `deps = { db, prices, now, budgetMs }` so tests inject fakes.

Minute pass, in order, with an 8 s budget checked between steps:

1. `select … from plans where status in ('armed','holding','ready') [and owner = $self] order by evaluated_at nulls first limit 200`.
2. Expire: `armed` with `arm_until < now` → `expired`; `holding` with `hold_until < now` → `expired` (position stays; log says "hold window ended, position kept"). Inbox row `plan_expired`.
3. Prices: one Jupiter Price v3 call for the distinct mints (≤ 50 per call; `prices-server.ts` batches like `catalog-server.ts:94-122`). A plan whose ticker has no price is skipped (logged once per hour, not failed).
4. For each `armed` plan with `met(trigger, price)`:
   - `execution = 'server'` (practice): build the `Fill` (`amountUsd / price` → shares for buys; `shares` or `fraction × held` for sells), run `applyFill` on the owner's `practice_portfolios` row, write with the version guard (retry once on conflict), insert `practice_fills` (`via 'plan'`, `plan_id`, `note = condition.note`), then `status = exits.length ? 'holding' : 'done'`, `filled = { price, shares, at, fillId }`. Failure (`applyFill` throws: cash/position changed) → `status 'failed'`, log the message verbatim (it is user-facing already, `ledger.ts:25-33`), inbox `plan_failed`.
   - `execution = 'notify'` (live fallback): `status 'ready'`, `ready_at`, inbox `plan_ready` with `href = /asset/<ticker>?plan=<id>` (section 9.8). A `ready` plan is re-checked each minute: if the condition stops being met for 30 minutes it goes back to `armed` (log "price moved away; re-armed") so a stale "ready" never lingers.
   - `execution = 'trigger'`: **not evaluated here** (Jupiter's keeper owns it; the server has no Jupiter JWT, 9.7). Only the expiry check applies (`arm_until` mirrors `expiresAt`).
5. For each `holding` plan with `exitHit(exits, price)`: practice → sell `min(held, filled.shares)` through the same ledger path (`via 'plan'`), `status 'done'`, inbox `plan_filled`; notify → `ready` with the sell prefilled.
6. Housekeeping (daily pass, and any minute pass with spare budget): verify pending `live_fills` (5.3); delete `proposed` plans older than 7 days; delete `inbox` rows read more than 30 days ago.
7. Set `evaluated_at = now` on every scanned row; return counts and `remaining` (rows not reached within the budget — they sort first next minute).

Prices are "last price at evaluation time", about once a minute — `met` is a level check, not a tick-level cross; the UI wording ("at or above") and system-prompt rule 7 say so.

### 8.4 Schedule (the recommended one)

After `PLAN_EVALUATOR_SECRET` (32+ random bytes, base64url) is set in Vercel's env for Production, the user runs in the Supabase SQL editor:

```sql
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select vault.create_secret('<same value>', 'plan_evaluator_secret');
select cron.schedule('solera-evaluate-plans', '* * * * *', $$
  select net.http_post(
    url := 'https://trysolera.vercel.app/api/plans/evaluate?pass=minute',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'plan_evaluator_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 9000) as request_id;
$$);
-- pause / resume / inspect
select cron.unschedule('solera-evaluate-plans');
select * from cron.job_run_details order by start_time desc limit 20;
select status_code, content::text from net._http_response order by created desc limit 20;
```

The secret sits in Supabase Vault, not in the job text (job commands are readable by anyone with DB access). Preview deployments do not get a schedule; they use the browser fallback.

### 8.5 Browser fallback (always on)

While the app is open and the visitor has a session, the Plans panel calls `POST /api/plans/evaluate?scope=self` every 60 s (and on focus). It evaluates only that owner's plans with the same code path, so a plan still fires with the tab open even if pg_cron is off or the project was paused. The response's `remaining` and `ms` are shown in the panel's foot ("checked 12 s ago · server watch on/off") — the panel reads a `GET /api/plans/health` that reports the last `evaluated_at` across all plans so the user can see whether the scheduled watcher is alive.

---

## 9. Live plans: Jupiter Trigger V2

### 9.1 What was verified (Sept 22, no funds, throwaway keypair; full log in section 16)

- `POST https://lite-api.jup.ag/trigger/v2/auth/challenge` and `/auth/verify` work **without an API key** (200; the verify reply is `{ authMode, token }`). `api.jup.ag` also answered the challenge keyless but returned `429 [API Gateway] Too many requests` from the third call on; `lite-api.jup.ag` (the host the app already uses for Ultra and Price v3, `jupiter.ts:11`) served ten consecutive calls. The docs say "All endpoints require an API key via the x-api-key header" (`/docs/trigger.md`); in practice the lite host does not, at low rates. Design for keyless on lite-api; an API key from `developers.jup.ag/portal` is an upgrade, not a requirement (and it would be a public key anyway, since these calls run in the browser).
- `GET /vault` → 404 `{ error: 'Vault not found' }` first, `GET /vault/register` → 200 `{ userPubkey, vaultPubkey, privyVaultId }`, second register → 409 as documented.
- `POST /deposit/craft` with `inputMint = AAPLx` (`XsbEhL…`), `outputMint = USDC`, `amount = 100000000` (1 share) → **200** with an unsigned transaction, `tokenDecimals: 8` and the vault as `receiverAddress`. The AAPLx and TSLAx mints are Token-2022 with extensions `[metadataPointer, permanentDelegate, defaultAccountState, scaledUiAmountConfig, pausableConfig, confidentialTransferMint, transferHook, tokenMetadata]` (RPC `getAccountInfo`, jsonParsed). The docs say transfer-hook mints are "rejected unless whitelisted" — the craft succeeding means these xStocks are whitelisted. Stop-losses on xStock positions are therefore expressible.
- `POST /deposit/craft` with `SOL → AAPLx`, `amount = 200000000` (0.2 SOL) → 200 with a transaction (crafting does not require a funded wallet; signing and landing it does). With `amount = 1000` lamports → `400 { error: 'Order must be at least 10 USD (current value: 0.00 USD)' }` — the $10 minimum is enforced at craft.
- `GET /orders/history` → `{ orders: [], pagination: { total: 0, limit: 20, offset: 0 } }`; a junk JWT → `401 { error: 'Unauthorized' }` (app-level, not gateway).
- Not verified (needs funds): landing a deposit, a fill, cancel/confirm-cancel with a real withdrawal. The request/response shapes for those come from the docs and are pinned in tests with fixtures, not live calls.

Facts from the docs that shape the UX: the vault is "a Privy-managed custodial account" (`/docs/trigger/deposit.md`) — funds leave the wallet at arm time and sit there until fill or cancel; every order needs `expiresAt` (max recommended 30 days, renewable via `PATCH`); JWT lasts 24 h, challenge 5 min; a leaked JWT can cancel or edit but "cannot withdraw funds" or create orders; cancel is two steps (`cancel` → sign withdrawal → `confirm-cancel`) and expired orders use the same flow to get funds back; default slippage for "buy above"/stop-loss is **20 %**, so Solera always sends an explicit `slippageBps`; `triggerPriceUsd` is compared to the `triggerMint`'s USD price; partial fills happen.

### 9.2 Mapping a `PlanCondition` to an order

```ts
// src/lib/jupiter-trigger-map.ts (pure; tested with fixtures)
export function toTriggerOrder(c: PlanCondition, ctx: { token: TokenInfo & { symbol }; price: number; solUsd: number; heldShares?: number; now: number; armUntil?: number })
  : { ok: true; order: PriceOrderBody; depositSubType: "single" | "oco" | "otoco"; summary: string; minUsdOk: boolean }
  | { ok: false; reason: string }   // → execution 'notify'
```

| Plan | Jupiter | Fields |
| --- | --- | --- |
| buy, `gte P` (stop-entry, the user's headline case) | `single` | `inputMint` SOL/USDC, `outputMint` xStock, `inputAmount` = `settlementBaseUnits(amountUsd, payWith)` (`trade.ts:221-226`), `triggerMint` xStock, `triggerCondition 'above'`, `triggerPriceUsd P` |
| buy, `lte P` (limit) | `single` | same with `'below'` |
| buy with exactly one target and one stop | `otoco` | parent as above + `tpPriceUsd`, `slPriceUsd` (tp > sl enforced by validation) |
| sell `shares`, `lte P` (stop-loss) | `single` | `inputMint` xStock, `outputMint` USDC (default; SOL if `payWith`), `inputAmount = toBaseUnits(shares, 8)`, `triggerMint` xStock, `'below'` |
| sell `shares`, `gte P` (take-profit) | `single` | same with `'above'` |
| sell `fraction` | `single` | `shares = fraction × heldShares` from the live balance at arm time (`getUltraBalances`) |
| existing position with target + stop, no buy | `oco` | `inputMint` xStock, `tpPriceUsd`, `slPriceUsd` |
| buy `shares` (not dollars) | `single` | `inputAmount = shares × price × (1 + 0.5 %)` in settlement units, summary says "about N shares" |
| anything else: `wrongIf` only, exits without matching shape, pre-IPO `leg`, `trigger.kind 'now'`, order value < $10 | — | `ok: false` → notify fallback (9.8) |

Common fields: `userPubkey` = wallet, `expiresAt = min(armUntil, now + 30 d)`, `slippageBps = 200` (editable in the arm sheet, 50–1000). Both `depositSubType` and the create `orderType` must agree (docs: mismatched subtype returns 4xx).

### 9.3 `POST /api/plans` for a live plan returns a preview

```ts
live: {
  execution: "trigger",
  order: PriceOrderBody,                 // without depositRequestId/depositSignedTx (filled in by the browser)
  depositSubType: "single" | "oco" | "otoco",
  summary: "Buy AAPLx with 0.25 SOL (≈ $50.00) when AAPLx is at or above $345.00. Expires Oct 22.",
  disclosures: [
    "Your 0.25 SOL moves to a Jupiter vault now and stays there until the order fills, expires, or you cancel.",
    "Jupiter's keepers fill it 24/7; the fill price can differ from $345.00 by up to 2 % (slippage).",
    "Cancelling or getting expired funds back needs one more signature.",
    "Minimum order $10."
  ],
  signatures: 2                          // message (auth) + deposit transaction; 3 on a first-time vault? no — vault register needs no signature
}
| { execution: "notify", reason: "Jupiter can't watch “until deliveries miss”; Solera will notify you and prefill the ticket." }
```

### 9.4 Arming from the browser (`src/lib/jupiter-trigger.ts`)

```ts
const TRIGGER = "https://lite-api.jup.ag/trigger/v2";
const jwts = new Map<string, { token: string; exp: number }>();      // in memory only (Jupiter: never localStorage)

export async function authenticate(wallet: TriggerWallet): Promise<string>      // challenge → wallet.signMessage → verify → token (24 h)
export async function ensureVault(token): Promise<{ vaultPubkey }>              // GET /vault, on 404 GET /vault/register
export async function craftDeposit(token, body): Promise<{ transaction, requestId, receiverAddress, amount, tokenDecimals }>
export async function createPriceOrder(token, body): Promise<{ id, txSignature, depositConfirmed }>
export async function listOrders(token, state: "active" | "past"): Promise<OrdersHistory>
export async function initiateCancel(token, orderId): Promise<{ transaction, requestId }>
export async function confirmCancel(token, orderId, signedTx, cancelRequestId): Promise<{ id, txSignature }>
```

Sequence on **Arm it** (desktop; wallet-adapter `signMessage`/`signTransaction`):

1. `authenticate(wallet)` — `POST /auth/challenge { walletPubkey, type: 'message' }` → the challenge text ("Sign this message to authenticate with Jupiter that you are the owner of <pubkey>… expires at … nonce …", verified) is shown in the arm sheet before the wallet prompt (Jupiter: "verify the challenge content before signing") → `signMessage` → `POST /auth/verify { type:'message', walletPubkey, signature: bs58 }` → `token`. Cached per wallet until `exp − 60 s`.
2. `ensureVault(token)`. First use registers a vault (no signature).
3. `craftDeposit(token, { inputMint, outputMint, userAddress: wallet, amount: order.inputAmount, orderType: 'price', orderSubType })`. Errors surface verbatim (`details` object per field, `/docs/trigger/errors.md`), e.g. the $10 minimum.
4. `signTransaction(VersionedTransaction.deserialize(base64))` — the second wallet prompt; the sheet says "This moves 0.25 SOL to your Jupiter vault."
5. `createPriceOrder(token, { ...order, depositRequestId, depositSignedTx })` → `{ id, txSignature, depositConfirmed }`. A `200` means the deposit landed (docs: "the deposit lands on-chain during the create call").
6. `PATCH /api/plans/:id { status: 'armed', trigger: { orderId: id, depositSignature: txSignature } }`. The server verifies the deposit signature on-chain like a fill (`getTransaction`, fee payer = the plan's wallet, `meta.err === null`), stores `trigger_order_id`, `trigger_deposit_sig`, `trigger_state 'open'` (or `'pending'` if `depositConfirmed` was false), `arm_until = expiresAt`, and logs the vault address. An unverifiable signature leaves the plan `proposed` with an error; the user can retry the PATCH once the RPC catches up (the order exists on Jupiter's side either way — the sync in 9.7 reconciles).

On iOS Safari (`isDeferredSigner(adapter)`, `deferred-signing.ts:114`), steps 1 and 4 each leave the page. Two new `Continuation` variants: `{ kind: "trigger-auth", planId, wallet, challenge }` (on return: verify → JWT → continue to step 2-3, stage the next one) and `{ kind: "trigger-deposit", planId, wallet, requestId, order }` (on return: step 5-6). `DeepLinkResumer` gains the two cases beside `swap`/`profile`/`session`. Three page loads, two Phantom hops; the arm sheet shows "Step 1 of 2: sign in with Phantom", "Step 2 of 2: approve the deposit".

### 9.5 What the user sees on the plan card

`armed · Jupiter order · funds in vault (0.25 SOL) · expires Oct 22` with a "View on Jupiter" link (`jup.ag`), `trigger_state` badge (`open` / `executing` / `filled` / `expired` / `failed`), the plain-language summary, and two actions: **Cancel & withdraw** and **Extend** (`PATCH /orders/price/:id` with a new `expiresAt`, no signature; then `PATCH /api/plans` mirrors `arm_until`).

### 9.6 Cancel and expired-funds path

1. `initiateCancel(token, orderId)` → order is `ready_to_cancel` immediately (no more fills) and returns the withdrawal transaction + `cancelRequestId`.
2. `signTransaction` → `confirmCancel` → `{ txSignature }`.
3. `PATCH /api/plans/:id { status: 'cancelled', trigger: { withdrawSignature } }` (server logs it; no on-chain check needed to cancel a plan row).
If step 2 is interrupted, the plan card shows "Withdrawal pending — tap to finish"; calling `initiateCancel` again is idempotent per the docs. `expired` orders (Jupiter state) use the identical path with the label "Get funds back".

### 9.7 Keeping `trigger_state` honest without a server-side JWT

The server never holds a Jupiter JWT (it is bound to a wallet signature and can cancel/edit orders). So Jupiter state is read by the browser: while the Plans panel is open and a JWT is cached, `listOrders(token, 'active')` + `'past'` every 60 s; each order's `orderState` is mirrored with `PATCH /api/plans/:id { triggerState }`. When an order reaches `filled`, the client posts the fill to `POST /api/fills` with the `fill` event's `txSignature`, `outputAmount`/`inputUsed` (converted with `fromBaseUnits`), `via 'plan'`, `planId`; the server verifies the signature on-chain (5.3) — here the fee payer is Jupiter's keeper, not the user, so the check for plan fills is instead "the transaction touches the plan's vault address (`receiverAddress`) and the wallet's token account" (`getTransaction` account keys include both) — and then flips the plan to `done` / `holding`. If the JWT expired, the card shows "Sign in with your wallet to refresh Jupiter status" (one `signMessage`). Without a fresh JWT, the plan keeps its last known state and the card says when it was last checked (`trigger_checked_at`).

### 9.8 Notify fallback (live plans Jupiter cannot express)

`execution 'notify'`: the evaluator (8.3) flips the plan to `ready` and writes an `inbox` row. Delivery:

- **In-app inbox** (`GET /api/inbox`, `POST /api/inbox/read { ids }`; bell in the shell with the unread count; Realtime insert subscription on `inbox` filtered by owner is not possible with anon RLS, so the client polls every 30 s while open).
- **One-tap sign**: the inbox row's `href` is `/asset/<ticker>?plan=<id>`; the asset page (no page reads `searchParams` today — audit) reads `plan`, `GET /api/plans/:id`, and prefills the ticket (side, amount/shares, note, "from plan: <summary>", the *current* quote, not the trigger price). The tap runs the existing `executeTrade` (Ultra), then `POST /api/fills` (`via 'plan'`, `planId`) and `PATCH /api/plans/:id { status: 'done', fillId }`. If the price moved away since notification, the ticket says so and the plan stays `ready`.
- **Email** (later): Supabase Auth's built-in sender is 2 emails/hour (verified) and is for auth mail only; a real channel needs custom SMTP or a Send Email hook and a stored, verified address. Out of scope for Thursday; the inbox row carries everything an email would.

---

## 10. Feed: posts, votes, comments

```
GET  /api/feed?sort=hot|new&ticker=AAPLx&cursor=…&limit=30   (anon)
     → { posts: [{ id, kind, ticker, title, url, source, publishedAt, owner, handle?, score, commentCount, myVote?: -1|0|1, createdAt }], next }
POST /api/feed/posts     (session)  { kind:'news', ref: url, title, source, publishedAt, ticker? }   → upsert on (kind, ref) → { post }
POST /api/feed/vote      (session)  { postId, dir: -1|0|1 }     → 0 deletes the vote → { post: { score, myVote } }
GET  /api/feed/comments?postId=…&sort=new|top                 (anon)  → { comments: [{ id, owner, handle?, body, createdAt }] }
POST /api/feed/comments  (session)  { postId, body }  → 3 s cooldown per owner (same as chat) → { comment }
```

- News posts come into being only when someone votes or comments on a headline the app fetched from `/api/news` (`ref = sha256(url)`); fills become posts when they carry a note (4.3 step 4, 5.3). No seeding, no synthetic scores.
- `hot = score / (ageHours + 2) ^ 1.4` computed in SQL (`order by score / power(extract(epoch from now() - created_at)/3600 + 2, 1.4) desc`) — the partner's formula (audit cites `engine.js:515`), on real votes.
- `myVote` comes from a second query when a session is present; the route never trusts a client-supplied owner.
- Comment and post bodies pass through `normalizeMessageBody`/`validateMessageBody` (`chat.ts:21-31`, `MESSAGE_MAX 280`).

---

## 11. News tool over the existing route

`src/app/api/news/route.ts` keeps its URL contract. Its loader functions (`tickerNews`, `generalNews`, `googleNews`, the 10-minute cache map) move to `src/lib/news-server.ts` exporting `loadNews(q: { ticker } | { company } | {}) : Promise<NewsResponse>` and the route becomes a thin wrapper. The agent's `get_news` tool calls `loadNews` in-process (no HTTP to itself, which would count as a second function invocation and could exceed the 10 s budget) and trims to `{ headline, source, publishedAt, url }` × 8. The mock and Claude both quote headlines verbatim; the `news` card renders the same `NewsList` the Discover page uses (outbound links only, as today).

`get_news` validates `ticker` with `/^[A-Z0-9.]{1,12}x$/` and `company` against `Object.keys(COMPANIES)` (`pre-ipo.ts:41-50`), exactly as the route does (`news/route.ts:35, 39`).

---

## 12. Environment and configuration

Names only (values are never printed):

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | existing | unchanged |
| `SOLERA_SESSION_SECRET` | existing (optional) | unchanged; derived from the service key when unset (`session-server.ts:11-16`) |
| `PLAN_EVALUATOR_SECRET` | new, server | bearer for `/api/plans/evaluate`; mirrored into Supabase Vault for pg_cron |
| `ANTHROPIC_API_KEY` | later, server | selects `AnthropicModel`; absent → `MockModel` |
| `SOLERA_AGENT_MODEL` | new, optional | `mock` forces the mock even with a key (tests, demos) |
| `SOLERA_AGENT_MODEL_ID` | new, optional | default `claude-opus-5` |
| `SOLANA_RPC_URL` | existing (optional) | on-chain verification of fills and deposits (`live-prices/route.ts:11` default is the public mainnet RPC; verification is one `getTransaction` per fill) |

`vercel.json` gains only the daily housekeeping cron (8.2). `src/app/api/agent/route.ts` sets `maxDuration = 60`; the evaluator keeps the default and its own 8 s budget.

New dependency: `@anthropic-ai/sdk` (0.128.0). `bs58` is already installed transitively (used by the probe in section 16) but should be added explicitly since `jupiter-trigger.ts` imports it. No `@supabase/ssr` this week.

---

## 13. Test plan (node:test, `npm test`)

### 13.1 Harness

`tests/_harness.mjs` exports the existing loader (`tests/session.test.mjs:6-13`) plus the alias shim and a fetch stub, so every new test is `import { load, stubFetch } from "./_harness.mjs"`:

```js
import Module from "node:module";
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) request = path.join(ROOT, "src", request.slice(2));   // tsconfig paths: "@/*": ["./src/*"]
  return orig.call(this, request, ...rest);
};
export function stubFetch(routes /* [{ match: RegExp | (url, init) => boolean, reply: (url, init) => { status, json } }] */) { … returns restore() }
```

Verified: with this shim `load("../src/app/api/session/route.ts")` returns the real `POST`, and `POST(new NextRequest(...))` yields `400 { error: 'Invalid request.' }` for a bad body and `400 { error: 'This signature has expired. Sign again.' }` for a stale claim; `load("../src/app/api/catalog/route.ts")` (which imports `@/data/xstocks.json`) loads too. Route tests therefore call handlers directly with `NextRequest`; Supabase is replaced by an in-memory fake `db` injected through the `deps` parameter of each `src/lib` function (routes build `deps` from `getSupabaseService()`; tests build it from `tests/_fake-db.mjs`, a `Map`-backed object with `from(table).select/insert/update/upsert/eq/in/order/limit/maybeSingle/single` returning `{ data, error }`).

### 13.2 Files and cases

| File | Covers | Cases |
| --- | --- | --- |
| `tests/owner.test.mjs` | `owner.ts` | wallet and uuid accepted; `0OIl` characters, uppercase uuid, empty, `../` rejected |
| `tests/session.test.mjs` (extended) | `session-server.ts` | old `{w}` token still verifies with `owner === wallet`; `{u}` token → `kind 'user'`; token with both claims → null; `sessionFromHeader` returns `Session` |
| `tests/session-route.test.mjs` | `/api/session` | body A happy path with a `tweetnacl` keypair signature; body B with stubbed `auth.getUser` (200 → token with `u`; 401 on error); 400/401 branches |
| `tests/profile-route.test.mjs` | `/api/profile` | wallet claim (existing); user-session upsert on `user_id`; link with signed `buildWalletLinkMessage`; 409 when the wallet already has a profile; `?owners=` mixed lookup |
| `tests/practice.test.mjs` | `fills.ts`, `/api/practice/*` | `validateFillInput` (exactly one of amount/shares, note length, leg only on pre-IPO buys); fill applies `applyFill` and bumps `version`; stale `expectedVersion` → 409 with the current portfolio; import refuses when a row exists; reset seeds 842.17 with `[]`; server price used (stubbed Price v3) |
| `tests/fills-route.test.mjs` | `/api/fills` | verified insert when the stubbed RPC returns the tx with fee payer = wallet; 202 unverified when RPC returns null; rejected when fee payer differs; duplicate signature → 409; post row created only when a note is present |
| `tests/plans.test.mjs` | `plans.ts` | `validateCondition` (no size → error; stop above a `gte` entry → error; two targets → error; `now` trigger → error for plans); `describe()` strings for the three canonical prompts; `met`/`exitHit` boundaries (equal price counts) |
| `tests/plans-route.test.mjs` | `/api/plans` | POST practice → `proposed`, `execution 'server'`; POST live without wallet → 403; PATCH armed/cancelled transitions and the log; DELETE only drafts; trigger PATCH stores ids after a stubbed on-chain check |
| `tests/evaluator.test.mjs` | `plans-evaluator.ts` | armed practice buy fires at price ≥ trigger and writes fill + `holding`; sell of `fraction` resolves against holdings; insufficient cash → `failed` with the ledger's message; `arm_until` and `hold_until` expiry; notify plan → `ready` + inbox row, back to `armed` after 30 min away; trigger plans untouched except expiry; budget exhaustion returns `remaining > 0` and next run picks them first; `scope=self` touches only that owner |
| `tests/evaluate-route.test.mjs` | `/api/plans/evaluate` | wrong/missing secret → 401; `scope=self` with a session; secret compare is length-safe |
| `tests/trigger-map.test.mjs` | `jupiter-trigger-map.ts` | the eight rows of the 9.2 table produce the documented bodies (mints from `tokens.ts`, base units via `toBaseUnits`); `expiresAt ≤ now + 30 d`; `< $10` → `ok:false`; `wrongIf`-only → `ok:false`; tp ≤ sl → `ok:false` |
| `tests/jupiter-trigger.test.mjs` | `jupiter-trigger.ts` | with `stubFetch` replaying the recorded responses from section 16 (challenge text, verify `{authMode, token}`, vault 404→register 200, craft 200/400 minimum, history shape, junk JWT 401): auth caches the token per wallet and re-auths on 401; `ensureVault` handles 404 and 409; craft error `details` surfaces per field; cancel retries with the same `cancelRequestId` |
| `tests/agent.test.mjs` | `run.ts`, `mock-model.ts`, `execute.ts`, tool schemas | every tool schema has `additionalProperties:false` and `required` listing all properties; the three canonical prompts end in the expected cards (`plan` × 2 after the size follow-up, `news` × 1 with headlines equal to the stubbed `loadNews` result); no size → no tool call and one question; direction missing → question; write tools without a session → `is_error` and a "sign in" reply; loop stops at 6 iterations with 502; `refusal` and `max_tokens` handled; tool results for one turn land in one user message |
| `tests/agent-route.test.mjs` | `/api/agent` | `SOLERA_AGENT_MODEL=mock` selected without a key; body limits (13 turns → 400); response shape has `model: 'mock'` |
| `tests/feed.test.mjs` | `/api/feed/*` | news post upsert on `(kind, ref)`; vote toggle −1/0/1 updates `score` (fake db runs the recount); comment cooldown 429; hot ordering with fixed `now` |
| `tests/news-server.test.mjs` | `news-server.ts` | cache hit within 10 min, stale-on-failure, Google fallback when `FINNHUB_API_KEY` is unset (existing `tests/news.test.mjs` parser cases stay) |

Anthropic is never called in tests (the SDK is imported only inside `anthropic-model.ts`, which the mock path does not load). The Jupiter tests replay fixtures; a separate `npm run probe:jupiter` script (the section 16 probe, kept under `scripts/`) can re-verify the live keyless endpoints on demand, no funds.

---

## 14. Build order for Thursday

1. `supabase/port.sql` (3.1–3.8) — the user runs it; `owner.ts`, `session-server.ts` claims, `auth-server.ts`, `/api/session` body B, `/api/profile` changes, `supabase-browser.ts`, the sign-up sheet wiring. Gate: `tests/owner`, `session`, `session-route`, `profile-route`.
2. Practice ledger routes + `usePortfolio` façade + sync-on-sign-in; `types.ts` note fields; `/api/fills`; tape route. Gate: `practice`, `fills-route`, existing `portfolio`/`trade` tests.
3. `plans.ts` + `/api/plans` + evaluator + `/api/plans/evaluate` + browser fallback; the user sets `PLAN_EVALUATOR_SECRET` and runs the 8.4 SQL. Gate: `plans`, `plans-route`, `evaluator`, `evaluate-route`.
4. `/api/agent` with `MockModel`, tools, cards; Agent tab. Gate: `agent`, `agent-route`. `ANTHROPIC_API_KEY` slots in with zero code change.
5. Trigger V2: `jupiter-trigger.ts`, `jupiter-trigger-map.ts`, the arm sheet, deferred continuations, cancel, sync; notify fallback + inbox + `?plan=` prefill. Gate: `trigger-map`, `jupiter-trigger`.
6. Feed routes + Discover wiring. Gate: `feed`.

Each step ends with `npm run typecheck && npm run lint && npm test` and a preview deploy.

---

## 15. Open questions (only the user can answer) and risks

Open questions:

1. **Model and spend.** The design defaults to `claude-opus-5` (skill default) with `effort: "low"`; a tool-using turn is roughly 3–4 K input tokens (mostly cached after the first call) and ~200 output tokens. Does the user want `SOLERA_AGENT_MODEL_ID=claude-sonnet-5` instead when the key arrives, and is there a monthly cap to enforce (e.g. a per-owner daily turn limit in the route)?
2. **Practice history import.** On first sign-in, move the device's practice cash/positions/fills to the account (with the sheet in 4.5), or always start every account fresh at $842.17?
3. **Live plan defaults.** Slippage 2 % (200 bps) for xStock trigger orders, expiry 30 days, settlement in SOL — acceptable defaults, or should the arm sheet force the user to pick each time?
4. **Who may read practice fills.** The tape shows practice fills of everyone whose profile is not private, including wallets with no profile at all. Alternatively hide practice fills of profile-less owners.
5. **Vault disclosure wording.** The plan card and arm sheet must say funds sit in a Privy-managed vault run by Jupiter until fill/cancel. Confirm this sentence is acceptable brand-wise, since it contradicts "Solera never holds keys or funds" only in appearance (Solera still holds nothing).
6. **Email accounts and the leaderboard.** Email-only users have no on-chain holdings; they appear on the tape (practice) but not on the wallet leaderboard. Fine?

Risks:

1. **Supabase Free pauses after 7 idle days.** If the project pauses, pg_cron stops and every route returns 5xx until it is restored from the dashboard. Mitigation: the browser fallback (8.5) and the health readout; a Vercel daily cron hit keeps PostgREST traffic flowing but has not been proven to count as "activity".
2. **pg_cron/pg_net availability on this project** was read from docs, not toggled on this project. If the Cron module is missing from the dashboard, fall back to GitHub Actions at `*/15` (8.2) — coarser, and needs the secret in repo secrets.
3. **Keyless `lite-api.jup.ag/trigger/v2`** worked today; Jupiter's docs say a key is required, so the lite host's tolerance could change during the hackathon. The code isolates the base URL and headers in one module; adding `x-api-key` (public, browser-side) is a one-line change if the user gets a portal key.
4. **Trigger V2 is beta** ("Behaviour, endpoints, and response formats may change", best-practices page). Tests pin fixtures; the sync code tolerates unknown fields.
5. **Deposit landed but the PATCH failed** (RPC lag, tab closed): the order exists on Jupiter while the plan row says `proposed`. The 9.7 sync reconciles when the user opens the panel with a JWT; the card explains. No funds are at risk (they are in the vault, withdrawable via 9.6).
6. **Evaluator granularity**: a level check once a minute can miss a spike that crosses and returns inside a minute; wording says "at or above" and the live path uses Jupiter's keepers. For practice this is acceptable and stated.
7. **Public RPC rate limits** for on-chain fill verification (`api.mainnet-beta.solana.com`): one `getTransaction` per fill/deposit; bursts could 429 → the 202 path and the housekeeping retry cover it. `SOLANA_RPC_URL` can point at a free Helius/Triton key later.
8. **Profile PK swap** rewrites the table; trivial at current size but run it once, on a quiet moment, and check `select id, wallet, user_id, owner from profiles` afterwards.
9. **Two wallet prompts per live plan** (message + deposit) on iOS mean three page loads; the continuation design covers it, but it needs a real device run before Thursday.

---

## 16. Verification log (Sept 22 2026)

| Check | How | Result |
| --- | --- | --- |
| Next 16 middleware file name | `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` | "The `middleware` file convention is deprecated and has been renamed to `proxy`"; file `proxy.ts` at project root or `src/`, export `proxy` or default, optional `config.matcher` |
| Route segment `maxDuration` | `…/03-file-conventions/02-route-segment-config/maxDuration.md` exists | usable as `export const maxDuration = 60` |
| Route handlers under the test harness | scratch script: `createRequire` + `ts.transpileModule` + `Module._resolveFilename` alias shim; `load("../src/app/api/session/route.ts").POST(new NextRequest(...))` | 400 `Invalid request.` on bad JSON; 400 `This signature has expired. Sign again.` on stale claim; `/api/catalog` (imports `@/data/xstocks.json`) loads |
| `next/server` under the harness | `load("next/server")` | exports `NextRequest, NextResponse, …`; `NextResponse.json({},{status:201})` → 201; `req.nextUrl.searchParams` and `req.json()` work |
| Supabase auth-js API | `node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts` | `signUp` (456), `signInWithPassword` (589), `getUser(jwt?: string)` (1591), `getClaims(jwt?, { jwks?, allowExpired? })` (2558); note at 1413 that unverified sessions from headers must not be trusted |
| `@supabase/ssr` | `npm view @supabase/ssr` and unpkg `dist/main/createServerClient.d.ts` | 0.12.7, peer `@supabase/supabase-js ^2.114.0` (installed 2.116.0); `createServerClient(url, key, { cookies: { getAll, setAll } })`; `get/set/remove` deprecated |
| Supabase Cron / pg_net | `supabase.com/docs/guides/cron`, `/guides/cron/install`, `/guides/cron/quickstart`, `/guides/database/extensions/pg_net` | dashboard "Cron Postgres Module under Integrations" or `create extension pg_cron with schema pg_catalog;`; schedules "from every second"; quickstart example `cron.schedule('…', '30 seconds', $$ select net.http_post(url:=…, headers:=jsonb_build_object(…), body:=…, timeout_milliseconds:=5000) $$)`; `net.http_post(url, body jsonb, params jsonb, headers jsonb, timeout_milliseconds int) returns bigint`; responses in `net._http_response` for 6 h; `cron.job_run_details` is not auto-cleaned |
| Supabase Free plan | `supabase.com/pricing`, `/docs/guides/auth/rate-limits` | 500 MB DB, 50 000 MAU, 500 K Edge Function invocations, "paused after 1 week of inactivity"; Auth: "2 emails per hour with the built-in email provider", 30 sign-in/sign-up requests per 5 min per IP |
| Vercel Hobby cron | `vercel.com/docs/cron-jobs/usage-and-pricing` | 100 jobs, "Once per day", precision "Per-hour (±59 min)"; more frequent expressions fail deployment |
| Vercel Hobby functions | `vercel.com/docs/functions/limitations`, `/docs/limits` | Fluid: 300 s default and max, 2 GB; legacy (pre-Apr 23 2025, non-Fluid): 10 s default / 60 s max; 4.5 MB body limit |
| GitHub Actions schedule | `docs.github.com` events-that-trigger-workflows, about-billing-for-github-actions | "shortest interval … once every 5 minutes"; delays at "the start of every hour"; disabled after 60 days inactivity (public repos); Free: 2 000 min/month private |
| Jupiter Trigger V2 docs | `developers.jup.ag/docs/trigger{,/authentication,/deposit,/create-order,/manage-orders,/lifecycle,/order-history,/errors,/best-practices}.md` | base `https://api.jup.ag/trigger/v2`; challenge/verify JWT 24 h, challenge 5 min; vault = "Privy-managed custodial account"; `deposit/craft` fields and $10 minimum; `orders/price` bodies for single/oco/otoco (+ trailing); `expiresAt` required; default slippage 20 % for buy-above/stop-loss; two-step cancel; `orders/history` states and events; error table; "V2 API is in beta" |
| Trigger V2 live, keyless, throwaway keypair (`tweetnacl`), no funds | `POST /auth/challenge`, `/auth/verify`, `GET /vault`, `/vault/register`, `POST /deposit/craft` ×3, `GET /orders/history`, junk JWT | **lite-api.jup.ag**: challenge 200 (`{type, challenge}`), verify 200 (`{authMode, token}`), vault 404 `Vault not found` then register 200 `{userPubkey, vaultPubkey, privyVaultId}` (409 on repeat), craft `SOL→AAPLx` 1000 lamports → 400 `Order must be at least 10 USD (current value: 0.00 USD)`, craft `AAPLx→USDC` 100000000 → 200 with `transaction`, `requestId`, `receiverAddress`=vault, `tokenDecimals: 8`, craft `SOL→AAPLx` 0.2 SOL → 200, history 200 `{orders: [], pagination: {total: 0, limit: 20, offset: 0}}`, junk JWT → 401 `{error: 'Unauthorized'}`. **api.jup.ag**: challenge/verify 200, vault/register 200, then `429 {code: 429, message: '[API Gateway] Too many requests'}` on the following calls without a key |
| xStock mint programs/extensions | public RPC `getAccountInfo` jsonParsed on AAPLx `XsbEhL…` and TSLAx `XsDoVf…` | owner `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` (Token-2022), 8 decimals, extensions `metadataPointer, permanentDelegate, defaultAccountState, scaledUiAmountConfig, pausableConfig, confidentialTransferMint, transferHook, tokenMetadata` — accepted by `deposit/craft`, so whitelisted |
| `@anthropic-ai/sdk` | `npm view @anthropic-ai/sdk version` | 0.128.0; API usage per the `claude-api` skill (manual loop, `strict: true` tools, `output_config.effort`, system-prompt `cache_control`, typed errors) |
| Existing fill call sites | grep | `src/components/TradeScreen.tsx:135 recordTrade({`, `src/components/DeepLinkResumer.tsx:155 recordLiveTrade(c.wallet, {` |
| Env var names present | `grep -o '^[A-Z_]*' .env.local` | `PYTH_API_KEY, FINNHUB_API_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY` (values never read) |
