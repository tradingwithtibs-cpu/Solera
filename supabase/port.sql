-- supabase/port.sql — Solera port: identity, practice ledger, fills, notes, plans, inbox, feed.
-- Run once in the Supabase SQL editor after schema.sql and chat.sql. Idempotent where
-- Postgres allows it. Every write still goes through the server (service role); the RLS
-- below only decides what the anon key may READ.

-- 1. owner format --------------------------------------------------------------------
-- An owner is a wallet (base58) or a Supabase Auth user id (uuid). The alphabets never collide.
create or replace function public.is_owner(o text) returns boolean
language sql immutable as $$
  select o ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
      or o ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

-- 2. profiles: surrogate key, nullable wallet, auth user link ---------------------------
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
-- The owner string: the auth user id when there is one, else the wallet.
alter table public.profiles add column if not exists owner text
  generated always as (coalesce(user_id::text, wallet)) stored;
create unique index if not exists profiles_owner_unique on public.profiles (owner);

-- messages: the author is the owner string; wallet stays for old rows and wallet authors.
alter table public.messages add column if not exists owner text;
update public.messages set owner = wallet where owner is null;
alter table public.messages alter column owner set not null;
alter table public.messages alter column wallet drop not null;
do $$ begin
  alter table public.messages add constraint messages_owner_format check (public.is_owner(owner));
exception when duplicate_object then null; end $$;
create index if not exists messages_owner_created on public.messages (owner, created_at desc);

-- 3. practice ledger ---------------------------------------------------------------------
-- One row per owner. holdings is the PortfolioBalances.holdings shape applyFill() takes:
-- [{ "ticker": "AAPLx", "shares": 1.5, "costBasis": 231.2 }].
create table if not exists public.practice_portfolios (
  owner       text primary key check (public.is_owner(owner)),
  cash        numeric(18,6) not null check (cash >= 0),
  holdings    jsonb not null default '[]'::jsonb check (jsonb_typeof(holdings) = 'array'),
  version     integer not null default 1,
  imported_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 4. plans ---------------------------------------------------------------------------------
create table if not exists public.plans (
  id                  uuid primary key default gen_random_uuid(),
  owner               text not null check (public.is_owner(owner)),
  wallet              text,
  mode                text not null check (mode in ('practice','live')),
  execution           text not null default 'server' check (execution in ('server','trigger','notify')),
  text                text not null check (char_length(text) between 1 and 280),
  condition           jsonb not null,
  summary             text not null,
  status              text not null default 'proposed'
                      check (status in ('proposed','armed','holding','ready','done','failed','expired','cancelled')),
  arm_until           timestamptz,
  hold_until          timestamptz,
  trigger_order_id    text,
  trigger_deposit_sig text,
  trigger_state       text,
  trigger_checked_at  timestamptz,
  ready_at            timestamptz,
  notified_at         timestamptz,
  notify_public_token text,
  filled              jsonb,
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

-- 5. fills ----------------------------------------------------------------------------------
create table if not exists public.practice_fills (
  id              uuid primary key default gen_random_uuid(),
  owner           text not null check (public.is_owner(owner)),
  ticker          text check (ticker is null or ticker ~ '^[A-Z0-9.]{1,12}x$'),
  mint            text,
  side            text not null check (side in ('buy','sell')),
  quantity        numeric(24,10) not null check (quantity > 0),
  price_per_share numeric(18,6) not null check (price_per_share > 0),
  total_value     numeric(18,6) not null check (total_value > 0),
  note            text check (char_length(note) <= 280),
  wrong_if        text check (char_length(wrong_if) <= 160),
  leg             text check (leg in ('gap','mark')),
  gap_at_buy      double precision,
  ref_at_buy      double precision,
  via             text not null default 'ticket' check (via in ('ticket','plan','agent','copy')),
  plan_id         uuid references public.plans(id) on delete set null,
  copied_from     text,
  created_at      timestamptz not null default now(),
  constraint practice_fills_asset check (ticker is not null or mint is not null)
);
create index if not exists practice_fills_owner_created on public.practice_fills (owner, created_at desc);
create index if not exists practice_fills_created on public.practice_fills (created_at desc);

create table if not exists public.live_fills (
  id              uuid primary key default gen_random_uuid(),
  owner           text not null check (public.is_owner(owner)),
  wallet          text not null,
  signature       text not null unique,
  ticker          text check (ticker is null or ticker ~ '^[A-Z0-9.]{1,12}x$'),
  mint            text,
  side            text not null check (side in ('buy','sell')),
  quantity        numeric(24,10) not null check (quantity > 0),
  price_per_share numeric(18,6) not null check (price_per_share > 0),
  total_value     numeric(18,6) not null check (total_value > 0),
  settled_in      text check (settled_in in ('SOL','USDC')),
  settled_amount  numeric(24,10),
  note            text check (char_length(note) <= 280),
  wrong_if        text check (char_length(wrong_if) <= 160),
  leg             text check (leg in ('gap','mark')),
  gap_at_buy      double precision,
  ref_at_buy      double precision,
  via             text not null default 'ticket' check (via in ('ticket','plan','agent','copy')),
  plan_id         uuid references public.plans(id) on delete set null,
  copied_from     text,
  verified        boolean not null default false,
  created_at      timestamptz not null default now(),
  constraint live_fills_asset check (ticker is not null or mint is not null)
);
create index if not exists live_fills_owner_created on public.live_fills (owner, created_at desc);
create index if not exists live_fills_created on public.live_fills (created_at desc);

-- 6. position notes ------------------------------------------------------------------------
create table if not exists public.position_notes (
  owner        text not null check (public.is_owner(owner)),
  key          text not null,
  note         text not null default '' check (char_length(note) <= 280),
  horizon      text not null default '' check (char_length(horizon) <= 24),
  wrong_if     text not null default '' check (char_length(wrong_if) <= 160),
  wrong_hit_at timestamptz,
  pinned       boolean not null default false,
  sort_order   integer not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (owner, key)
);

-- 7. inbox (notify fallback) ---------------------------------------------------------------
create table if not exists public.inbox (
  id          uuid primary key default gen_random_uuid(),
  owner       text not null check (public.is_owner(owner)),
  kind        text not null check (kind in ('plan_ready','plan_filled','plan_failed','plan_expired','plan_cancelled')),
  plan_id     uuid references public.plans(id) on delete cascade,
  title       text not null check (char_length(title) <= 120),
  body        text not null default '' check (char_length(body) <= 500),
  href        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists inbox_owner_unread on public.inbox (owner, created_at desc) where read_at is null;

-- 8. feed: posts, votes, comments ------------------------------------------------------------
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('news','practice_fill','live_fill')),
  ref           text not null,
  ticker        text check (ticker is null or ticker ~ '^[A-Z0-9.]{1,12}x$'),
  owner         text check (owner is null or public.is_owner(owner)),
  title         text not null check (char_length(title) between 1 and 300),
  url           text,
  source        text,
  published_at  timestamptz,
  score         integer not null default 0,
  comment_count integer not null default 0,
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

-- 9. RLS --------------------------------------------------------------------------------------
alter table public.practice_portfolios enable row level security;   -- no anon policy: server only
alter table public.plans               enable row level security;   -- no anon policy: server only
alter table public.inbox               enable row level security;   -- no anon policy: server only
alter table public.votes               enable row level security;   -- no anon policy: scores live on posts
alter table public.position_notes      enable row level security;   -- no anon policy: server only

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

-- Optional realtime for the tape and comments (rooms already do this in chat.sql).
do $$ begin
  alter publication supabase_realtime add table public.practice_fills;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.live_fills;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.comments;
exception when duplicate_object then null; end $$;

-- 10. evaluator schedule — run only after PLAN_EVALUATOR_SECRET is set on Vercel (docs/port/backend.md §8.4).
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
