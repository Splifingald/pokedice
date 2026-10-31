-- The legends' own cinematics (docs/53): Mewtwo's lab, Articuno's ice cavern, Zapdos's power plant, Moltres's
-- volcano, Mew's forest… instead of the shared entrance, and no warning tapes on a legend's raid.
-- 1. game_config `legendCinema`: the switch, Off (left alone when there). It only changes how an entrance looks and
--    sounds on the player's device (the engine has decided the fight first), so no server function acts for it and
--    none reads it.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
begin;
insert into game_config (key, value) values ('legendCinema', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
