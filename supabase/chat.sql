-- Solera chat rooms. Run once in the Supabase SQL editor (after schema.sql).
--
-- One room per tokenized stock, keyed by ticker. Anyone can read; only the
-- server route /api/chat inserts, after checking a session token that the
-- wallet earned by signing a message. The anon key never writes.

create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  room        text not null check (room ~ '^[A-Z0-9.]{1,12}x$'),
  wallet      text not null,
  body        text not null check (char_length(body) between 1 and 280),
  created_at  timestamptz not null default now()
);

create index if not exists messages_room_created on public.messages (room, created_at desc);
create index if not exists messages_wallet_created on public.messages (wallet, created_at desc);

alter table public.messages enable row level security;

drop policy if exists "messages are readable" on public.messages;
create policy "messages are readable"
  on public.messages for select
  using (true);

-- Push new messages to open rooms over Supabase Realtime. Optional: rooms
-- also poll every few seconds, so nothing breaks if this line is skipped.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;
