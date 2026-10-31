-- The champions' own cinematics (docs/54): Red on Mt. Silver's summit, Lance's dragons over the Indigo Plateau, Leon's
-- stadium… instead of the trainer stepping onto the field, before every League Champion's fight.
-- 1. game_config `championCinema`: the switch, Off (left alone when there). It only changes how an entrance looks and
--    sounds on the player's device (the engine has decided the fight first), so no server function acts for it and
--    none reads it.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
begin;
insert into game_config (key, value) values ('championCinema', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
