-- Solera profiles. Run once in the Supabase SQL editor.
--
-- Identity is the wallet. A profile row can only be created or changed by
-- the server route /api/profile, which verifies an ed25519 signature from
-- that wallet before writing with the service role. The anon key can read
-- public profiles and nothing else.

create table if not exists public.profiles (
  wallet        text primary key,
  handle        text not null,
  name          text not null,
  bio           text not null default '',
  avatar_url    text,
  visibility    text not null default 'public' check (visibility in ('public', 'private')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint handle_format check (handle ~ '^[a-z0-9_]{3,20}$'),
  constraint name_length   check (char_length(name) between 1 and 40),
  constraint bio_length    check (char_length(bio) <= 160)
);

create unique index if not exists profiles_handle_unique on public.profiles (lower(handle));

alter table public.profiles enable row level security;

-- Anyone (anon key) may read public profiles. No insert/update/delete
-- policies exist for anon, so only the service role can write.
drop policy if exists "public profiles are readable" on public.profiles;
create policy "public profiles are readable"
  on public.profiles for select
  using (visibility = 'public');
