-- The gift calendar (docs/55): a live event of type `calendar`, a door a day with one reward each (an item, Pokédollars
-- or a Pokémon, in a quantity), opened on its day or the next.
-- 1. game_config `giftCalendar`: its switch, Off (left alone when there). The calendar itself is a live event in the
--    `liveEvents` row the admin already writes. The doors a player opened are in their own save, on the server's clock
--    (event_time), like the Special Shop's limits, so no server function acts for it and none reads it.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
begin;
insert into game_config (key, value) values ('giftCalendar', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
