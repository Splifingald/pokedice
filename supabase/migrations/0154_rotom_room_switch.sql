-- The Rotom Room's switch (docs/73), after 0153 (its content). Safe to run again: the admin's switch is kept, the
-- function replaced. supabase/seed.sql inlines it.
-- 1. game_config `rotomRoom`: the switch, Off, and the prize's level (the shiny Rotom for the complete Rotom Pokédex).
-- 2. rotom_room_open(): the switch as the server reads it for the caller, as tracks_open() (0124): on for everyone, or
--    for the admin only. The game asks it before a signed-in player enters the room, so an old build or a hand-made
--    save can't play it while it's off.
-- 3. configVersion + 1, so players fetch the new switch.
begin;

-- 1.
insert into game_config (key, value) values ('rotomRoom', '{"access": "off", "prizeLevel": 60}'::jsonb) on conflict (key) do nothing;

-- 2. An odd value is off; never null.
create or replace function rotom_room_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select coalesce((select value ->> 'access' from game_config where key = 'rotomRoom' and jsonb_typeof(value) = 'object'), 'off') a) x
$$;
revoke all on function rotom_room_open() from public;
grant execute on function rotom_room_open() to anon, authenticated;

-- 3.
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
