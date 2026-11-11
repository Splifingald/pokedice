-- The new address (docs/72-NEW-ADDRESS.md): the game moves from poke-dice.netlify.app to pokedice.graf.quest, and a
-- browser keeps a save per address, so the old address hands each player's save to the new one through here.
--
-- 1. game_config `siteMove`: the switch (Off / On for admin / On for beta testers / On for everyone), Off.
-- 2. site_moves: one row per save on its way, under a random code, for an hour at most. Players never touch it: the
--    two functions below are `security definer`.
-- 3. site_move_drop(payload): the old address leaves the packed save (the device's game data, compressed) and gets its
--    code back. Checks the switch for the caller (an old build or a hand-made call can't use it while it's off), the
--    size, and the table's room.
-- 4. site_move_take(code): the new address takes it, once: the row goes as it's read. No switch check here: a code only
--    exists if the drop passed it, and the new address has no session yet to check "On for admin" against.
--
-- Run after 0131 (access_open). Safe to run again. supabase/seed.sql doesn't inline it.

begin;

-- ---------------------------------------------------------------- 1. the switch

insert into game_config (key, value) values ('siteMove', '{"access": "off"}'::jsonb)
on conflict (key) do nothing;
-- Open games read the config again, the row in it.
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

create or replace function site_move_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select access_open((select value ->> 'access' from game_config where key = 'siteMove' and jsonb_typeof(value) = 'object'))
$$;

-- ---------------------------------------------------------------- 2. the table

create table if not exists site_moves (
  code uuid primary key default gen_random_uuid(),
  payload text not null,
  created_at timestamptz not null default now()
);

alter table site_moves enable row level security;
revoke all on site_moves from anon, authenticated;

-- ---------------------------------------------------------------- 3. leaving the old address

create or replace function site_move_drop(p_payload text)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_code uuid;
begin
  if not site_move_open() then raise exception 'site_move_closed' using errcode = '42501'; end if;
  -- The biggest save in the game is 1.3 MB of JSON, and the game sends it compressed: 8 MB is a hand-made call.
  if p_payload is null or length(p_payload) = 0 or length(p_payload) > 8000000 then
    raise exception 'site_move_size' using errcode = '22023';
  end if;
  -- A save not taken within the hour is left behind (the old address still has it and sends it again next visit).
  delete from site_moves where created_at < now() - interval '1 hour';
  -- Far more than a busy hour of players moving: past it, someone is filling the table.
  if (select count(*) from site_moves) >= 20000 then raise exception 'site_move_full' using errcode = '53400'; end if;
  insert into site_moves (payload) values (p_payload) returning code into v_code;
  return v_code;
end
$$;

-- ---------------------------------------------------------------- 4. arriving at the new address

create or replace function site_move_take(p_code uuid)
returns text
language sql volatile security definer set search_path = public as $$
  delete from site_moves where code = p_code and created_at > now() - interval '1 hour' returning payload
$$;

revoke all on function site_move_open() from public;
revoke all on function site_move_drop(text) from public;
revoke all on function site_move_take(uuid) from public;
grant execute on function site_move_open() to anon, authenticated;
grant execute on function site_move_drop(text) to anon, authenticated;
grant execute on function site_move_take(uuid) to anon, authenticated;

commit;
