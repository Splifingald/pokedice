-- The shiny Pokédex (docs/39).
-- 1. game_config `shinyDex`: the switch, Off (left alone when there). The page shows what the save already holds (the
--    shinies each region has owned, noted on the player's device), so no server function acts for it and none reads it.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
begin;
insert into game_config (key, value) values ('shinyDex', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
