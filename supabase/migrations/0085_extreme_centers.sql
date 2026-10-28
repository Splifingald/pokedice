-- Extreme mode's Pokémon Centers (docs/47): a boon to pick instead of the heal.
-- 1. game_config `extremeCenters`: the switch, Off (left alone when there). The boons are drawn and taken in the save
--    on the player's device, as a Pokémon Center's heal is, so no server function acts for them and none reads it;
--    every number falls back to the game's defaults until the admin edits them.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
begin;
insert into game_config (key, value) values ('extremeCenters', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
