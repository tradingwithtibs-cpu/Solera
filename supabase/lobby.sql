-- supabase/lobby.sql — the Everyone lobby. Run once in the Supabase SQL editor after port.sql.
-- messages.room was constrained to ticker rooms ("AAPLx"); the Discover card's Everyone tab
-- posts to the room "everyone". Replaces that check so the lobby is allowed too.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.messages'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%room%'
  loop
    execute format('alter table public.messages drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.messages
  add constraint messages_room_check check (room ~ '^[A-Z0-9.]{1,12}x$' or room = 'everyone');
