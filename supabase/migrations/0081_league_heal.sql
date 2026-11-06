-- The League's heal between its battles (docs/42).
-- 1. game_config `leagueHeal`: the switch, Off (left alone when there). The heal is written into the save on the
--    player's device, as a Pokémon Center's is, so no server function acts for it and none reads it.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
begin;
insert into game_config (key, value) values ('leagueHeal', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
