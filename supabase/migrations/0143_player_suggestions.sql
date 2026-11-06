-- The players' suggestions (docs/67), version 2.9.3: five switches, each Off (left alone when there).
-- 1. game_config `raidFavourites` (favourites first in the raid team picker), `shinyTiles` (shinies on gold in the
--    Box), `passOwned` (PASS on an owned Pokémon's catch), `routeShinies` (the shiny star on an area's Pokémon) and
--    `autoCure` (auto-mode's HEAL button). The favourites are written into the save on the player's device, and the
--    others only change what a screen shows or offers, so no server function acts for them and none reads them.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
begin;
insert into game_config (key, value) values ('raidFavourites', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('shinyTiles', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('passOwned', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('routeShinies', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('autoCure', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
